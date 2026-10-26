-- YourWay — enum types for route kinds, stop kinds and booking statuses.
-- Run after 0007_privacy_fixes.sql. Safe to run again.
--
-- These columns were text with a CHECK constraint. As enums, the allowed values
-- live in one named type, and a mistyped value in a function (status = 'actve')
-- raises an error instead of quietly matching nothing. Functions still return
-- these columns as text, so the API the app sees doesn't change.

do $$ begin
  create type public.route_kind as enum ('recurring', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stop_kind as enum ('pickup', 'dropoff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('active', 'cancelled', 'late_cancelled');
exception when duplicate_object then null; end $$;

-- ─── Columns ─────────────────────────────────────────────────────────────────
-- Constraints and partial indexes that compare these columns to text are
-- dropped first and recreated against the enum.

alter table public.routes drop constraint if exists routes_kind_check;
alter table public.routes drop constraint if exists routes_check;
alter table public.routes alter column kind type public.route_kind using kind::public.route_kind;
alter table public.routes add constraint routes_check check (
  (kind = 'recurring' and cardinality(weekdays) > 0)
  or (kind = 'one_time' and ride_date is not null)
);

alter table public.stops drop constraint if exists stops_kind_check;
alter table public.stops alter column kind type public.stop_kind using kind::public.stop_kind;

drop index if exists public.bookings_one_active_per_passenger;
drop index if exists public.bookings_ride_idx;
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings alter column status drop default;
alter table public.bookings alter column status type public.booking_status using status::public.booking_status;
alter table public.bookings alter column status set default 'active';
create unique index if not exists bookings_one_active_per_passenger
  on public.bookings (route_id, ride_date, passenger_id) where status = 'active';
create index if not exists bookings_ride_idx on public.bookings (route_id, ride_date) where status = 'active';

-- ─── Functions that compared or assigned these columns as text ───────────────

-- book_ride itself is unchanged, but it holds a public.routes row variable:
-- connections that already ran it keep a plan with kind as text and fail
-- ("attribute 4 has wrong type"). Altering the function makes them recompile it.
alter function public.book_ride(uuid, date, uuid, uuid) security definer;

-- An unknown p_kind is now an error rather than an empty result.
create or replace function public.search_rides(
  p_group_id  uuid default null,
  p_date      date default null,
  p_kind      text default null,
  p_from_time time default null,
  p_to_time   time default null
)
returns table (
  route_id     uuid,
  ride_date    date,
  kind         text,
  driver_id    uuid,
  driver_name  text,
  origin       text,
  destination  text,
  out_time     time,
  return_time  time,
  seats        smallint,
  seats_left   integer,
  price        numeric
)
language sql stable
security definer set search_path = ''
as $$
  with days as (
    select d::date as ride_date
    from generate_series(
      coalesce(p_date, public.israel_today()),
      coalesce(p_date, public.israel_today() + 6),
      interval '1 day'
    ) d
  )
  select r.id, days.ride_date, r.kind, r.driver_id, p.full_name, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = days.ride_date and b.status = 'active')::integer,
         r.price
  from public.routes r
  join days on public.route_runs_on(r, days.ride_date)
  join public.ride_groups g on g.id = r.group_id and g.is_active
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = days.ride_date
  where auth.uid() is not null
    and r.is_active
    and r.driver_id <> auth.uid()
    and coalesce(x.cancelled, false) = false
    and public.departure_at(days.ride_date, coalesce(x.out_time, r.out_time)) > now()
    and (p_group_id is null or r.group_id = p_group_id)
    and (p_kind is null or r.kind = p_kind::public.route_kind)
    and (p_from_time is null or coalesce(x.out_time, r.out_time) >= p_from_time)
    and (p_to_time is null or coalesce(x.out_time, r.out_time) < p_to_time)
  order by days.ride_date, coalesce(x.out_time, r.out_time)
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booking  public.bookings;
  v_depart   timestamptz;
  v_status   public.booking_status;
begin
  select * into v_booking from public.bookings
  where id = p_booking_id and passenger_id = auth.uid() and status = 'active'
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select public.departure_at(v_booking.ride_date, coalesce(x.out_time, r.out_time)) into v_depart
  from public.routes r
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = v_booking.ride_date
  where r.id = v_booking.route_id;

  if v_depart <= now() then raise exception 'RIDE_DEPARTED'; end if;

  v_status := case when v_depart - now() >= interval '2 hours' then 'cancelled' else 'late_cancelled' end;
  update public.bookings set status = v_status, cancelled_at = now() where id = p_booking_id;
  return v_status;
end;
$$;

-- Same as in 0003, with the JSON strings cast to the enums.
create or replace function public.save_route(p_route_id uuid, p_route jsonb, p_stops jsonb)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_id        uuid;
  v_kind      public.route_kind := (p_route ->> 'kind')::public.route_kind;
  v_weekdays  smallint[];
  v_stop      jsonb;
  v_stop_kind public.stop_kind;
  v_stop_id   uuid;
  v_keep      uuid[] := '{}';
  v_pickups   smallint := 0;
  v_dropoffs  smallint := 0;
  v_position  smallint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select coalesce(array_agg(d::smallint order by d::smallint), '{}')
  into v_weekdays
  from jsonb_array_elements_text(coalesce(p_route -> 'weekdays', '[]')) d;

  if p_route_id is null then
    insert into public.routes (driver_id, group_id, kind, weekdays, ride_date, out_time, return_time, seats, price)
    values (
      auth.uid(),
      (p_route ->> 'group_id')::uuid,
      v_kind,
      case when v_kind = 'recurring' then v_weekdays else '{}' end,
      case when v_kind = 'one_time' then (p_route ->> 'ride_date')::date end,
      (p_route ->> 'out_time')::time,
      nullif(p_route ->> 'return_time', '')::time,
      (p_route ->> 'seats')::smallint,
      (p_route ->> 'price')::numeric
    )
    returning id into v_id;
  else
    update public.routes set
      group_id    = (p_route ->> 'group_id')::uuid,
      kind        = v_kind,
      weekdays    = case when v_kind = 'recurring' then v_weekdays else '{}' end,
      ride_date   = case when v_kind = 'one_time' then (p_route ->> 'ride_date')::date end,
      out_time    = (p_route ->> 'out_time')::time,
      return_time = nullif(p_route ->> 'return_time', '')::time,
      seats       = (p_route ->> 'seats')::smallint,
      price       = (p_route ->> 'price')::numeric
    where id = p_route_id and driver_id = auth.uid() and is_active
    returning id into v_id;
    if v_id is null then raise exception 'ROUTE_NOT_FOUND'; end if;
  end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    v_stop_kind := (v_stop ->> 'kind')::public.stop_kind;
    if v_stop_kind = 'pickup' then
      v_pickups := v_pickups + 1; v_position := v_pickups;
    else
      v_dropoffs := v_dropoffs + 1; v_position := v_dropoffs;
    end if;

    v_stop_id := nullif(v_stop ->> 'id', '')::uuid;
    if v_stop_id is not null then
      update public.stops set
        kind = v_stop_kind, label = v_stop ->> 'label',
        lat = (v_stop ->> 'lat')::double precision, lng = (v_stop ->> 'lng')::double precision,
        position = v_position, is_active = true
      where id = v_stop_id and route_id = v_id
      returning id into v_stop_id;
    end if;
    if v_stop_id is null then
      insert into public.stops (route_id, kind, label, lat, lng, position)
      values (v_id, v_stop_kind, v_stop ->> 'label',
              (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision, v_position)
      returning id into v_stop_id;
    end if;
    v_keep := v_keep || v_stop_id;
  end loop;

  if v_pickups = 0 or v_dropoffs = 0 then raise exception 'STOPS_REQUIRED'; end if;

  -- Stops removed from the route: archive the ones bookings point at, delete the rest.
  update public.stops s set is_active = false
  where s.route_id = v_id and s.is_active and not (s.id = any (v_keep))
    and exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);
  delete from public.stops s
  where s.route_id = v_id and not (s.id = any (v_keep))
    and not exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);

  return v_id;
end;
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.search_rides, public.cancel_booking, public.save_route from anon, public;
grant execute on function public.search_rides, public.cancel_booking, public.save_route to authenticated;
