-- YourWay — rides, stops and bookings (SRS §4 Passenger Hub, §5 Driver Hub, §6 Cancellations)
-- Run after 0001_profiles.sql.

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- Ride groups ("Beit Shemesh ← Jerusalem"). Only admins manage them (SRS §8).
create table if not exists public.ride_groups (
  id           uuid primary key default gen_random_uuid(),
  origin       text not null,
  destination  text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (origin, destination)
);

-- A driver's route: recurring on weekdays, or a one-time ride on a single date.
create table if not exists public.routes (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references public.profiles (id) on delete cascade,
  group_id     uuid not null references public.ride_groups (id),
  kind         text not null check (kind in ('recurring', 'one_time')),
  weekdays     smallint[] not null default '{}',   -- 0 = Sunday … 6 = Saturday
  ride_date    date,                               -- one-time rides only
  out_time     time not null,                      -- outbound departure
  return_time  time,                               -- null = flexible return
  seats        smallint not null check (seats between 1 and 8),
  price        numeric(6, 2) not null default 0 check (price >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  check (
    (kind = 'recurring' and cardinality(weekdays) > 0)
    or (kind = 'one_time' and ride_date is not null)
  )
);
create index if not exists routes_group_idx on public.routes (group_id) where is_active;

-- Designated pickup / drop-off pins on a route's map.
create table if not exists public.stops (
  id        uuid primary key default gen_random_uuid(),
  route_id  uuid not null references public.routes (id) on delete cascade,
  kind      text not null check (kind in ('pickup', 'dropoff')),
  label     text not null,
  lat       double precision not null,
  lng       double precision not null,
  position  smallint not null default 0
);
create index if not exists stops_route_idx on public.stops (route_id);

-- Per-date changes a driver makes without touching the recurring schedule
-- ("cancel for this date only", updated departure time).
create table if not exists public.ride_exceptions (
  route_id   uuid not null references public.routes (id) on delete cascade,
  ride_date  date not null,
  cancelled  boolean not null default false,
  out_time   time,
  primary key (route_id, ride_date)
);

-- A passenger's seat on a route for a specific date.
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid not null references public.routes (id) on delete cascade,
  ride_date        date not null,
  passenger_id     uuid not null references public.profiles (id) on delete cascade,
  pickup_stop_id   uuid not null references public.stops (id),
  dropoff_stop_id  uuid not null references public.stops (id),
  status           text not null default 'active'
                   check (status in ('active', 'cancelled', 'late_cancelled')),
  is_paid          boolean not null default false,   -- personal toggle, passenger only
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz
);
create unique index if not exists bookings_one_active_per_passenger
  on public.bookings (route_id, ride_date, passenger_id) where status = 'active';
create index if not exists bookings_ride_idx on public.bookings (route_id, ride_date) where status = 'active';
create index if not exists bookings_passenger_idx on public.bookings (passenger_id, ride_date);

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.israel_today()
returns date
language sql stable
as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;

create or replace function public.departure_at(p_date date, p_time time)
returns timestamptz
language sql stable
as $$ select (p_date + p_time) at time zone 'Asia/Jerusalem' $$;

create or replace function public.route_runs_on(r public.routes, p_date date)
returns boolean
language sql immutable
as $$
  select case r.kind
    when 'recurring' then extract(dow from p_date)::smallint = any (r.weekdays)
    else r.ride_date = p_date
  end
$$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table public.ride_groups     enable row level security;
alter table public.routes          enable row level security;
alter table public.stops           enable row level security;
alter table public.ride_exceptions enable row level security;
alter table public.bookings        enable row level security;

-- Groups: everyone signed in can read; only admins write.
drop policy if exists "Read groups" on public.ride_groups;
create policy "Read groups" on public.ride_groups for select to authenticated using (true);
drop policy if exists "Admins manage groups" on public.ride_groups;
create policy "Admins manage groups" on public.ride_groups for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Routes & stops: everyone signed in can read; drivers manage their own.
drop policy if exists "Read routes" on public.routes;
create policy "Read routes" on public.routes for select to authenticated using (true);
drop policy if exists "Drivers manage own routes" on public.routes;
create policy "Drivers manage own routes" on public.routes for all to authenticated
  using (driver_id = (select auth.uid())) with check (driver_id = (select auth.uid()));

drop policy if exists "Read stops" on public.stops;
create policy "Read stops" on public.stops for select to authenticated using (true);
drop policy if exists "Drivers manage own stops" on public.stops;
create policy "Drivers manage own stops" on public.stops for all to authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())))
  with check (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())));

drop policy if exists "Read exceptions" on public.ride_exceptions;
create policy "Read exceptions" on public.ride_exceptions for select to authenticated using (true);
drop policy if exists "Drivers manage own exceptions" on public.ride_exceptions;
create policy "Drivers manage own exceptions" on public.ride_exceptions for all to authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())))
  with check (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())));

-- Bookings: a passenger sees her own, a driver sees bookings on her routes.
-- Creating and cancelling go through book_ride() / cancel_booking() only.
drop policy if exists "Read own or driven bookings" on public.bookings;
create policy "Read own or driven bookings" on public.bookings for select to authenticated
  using (
    passenger_id = (select auth.uid())
    or exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid()))
  );
drop policy if exists "Passengers update own bookings" on public.bookings;
create policy "Passengers update own bookings" on public.bookings for update to authenticated
  using (passenger_id = (select auth.uid())) with check (passenger_id = (select auth.uid()));

revoke insert, update, delete on public.bookings from authenticated;
grant update (is_paid) on public.bookings to authenticated;   -- the "Paid / Unpaid" toggle

-- ─── Passenger functions ─────────────────────────────────────────────────────

-- Available rides (SRS §4.1). With no date: the next 7 days.
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
    and (p_kind is null or r.kind::text = p_kind)   -- ::text: still valid once 0008 makes kind an enum
    and (p_from_time is null or coalesce(x.out_time, r.out_time) >= p_from_time)
    and (p_to_time is null or coalesce(x.out_time, r.out_time) < p_to_time)
  order by days.ride_date, coalesce(x.out_time, r.out_time)
$$;

-- One ride on one date, with the driver's contact details (SRS §4.2, §2).
create or replace function public.get_ride(p_route_id uuid, p_date date)
returns table (
  route_id        uuid,
  ride_date       date,
  kind            text,
  driver_id       uuid,
  driver_name     text,
  driver_phone    text,
  driver_email    text,
  vehicle_model   text,
  vehicle_color   text,
  origin          text,
  destination     text,
  out_time        time,
  return_time     time,
  seats           smallint,
  seats_left      integer,
  price           numeric,
  is_available    boolean,
  my_booking_id   uuid
)
language sql stable
security definer set search_path = ''
as $$
  select r.id, p_date, r.kind, r.driver_id, p.full_name, p.phone, p.email,
         p.vehicle_model, p.vehicle_color, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer,
         r.price,
         r.is_active and public.route_runs_on(r, p_date) and coalesce(x.cancelled, false) = false
           and public.departure_at(p_date, coalesce(x.out_time, r.out_time)) > now(),
         (select b.id from public.bookings b
          where b.route_id = r.id and b.ride_date = p_date
            and b.passenger_id = auth.uid() and b.status = 'active')
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where auth.uid() is not null and r.id = p_route_id
$$;

-- Book a seat. Locks the route row so two passengers can't take the last seat
-- at the same time; a full ride is blocked (no waitlist).
create or replace function public.book_ride(
  p_route_id uuid, p_date date, p_pickup_stop_id uuid, p_dropoff_stop_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_route   public.routes;
  v_exc     public.ride_exceptions;
  v_taken   integer;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select * into v_route from public.routes where id = p_route_id for update;
  if not found or not v_route.is_active or not public.route_runs_on(v_route, p_date) then
    raise exception 'RIDE_UNAVAILABLE';
  end if;
  if v_route.driver_id = v_uid then raise exception 'OWN_RIDE'; end if;

  select * into v_exc from public.ride_exceptions where route_id = p_route_id and ride_date = p_date;
  if coalesce(v_exc.cancelled, false)
     or public.departure_at(p_date, coalesce(v_exc.out_time, v_route.out_time)) <= now() then
    raise exception 'RIDE_UNAVAILABLE';
  end if;

  if not exists (select 1 from public.stops where id = p_pickup_stop_id and route_id = p_route_id and kind = 'pickup')
     or not exists (select 1 from public.stops where id = p_dropoff_stop_id and route_id = p_route_id and kind = 'dropoff') then
    raise exception 'INVALID_STOP';
  end if;

  if exists (select 1 from public.bookings where route_id = p_route_id and ride_date = p_date
             and passenger_id = v_uid and status = 'active') then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into v_taken from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active';
  if v_taken >= v_route.seats then raise exception 'RIDE_FULL'; end if;

  insert into public.bookings (route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id)
  values (p_route_id, p_date, v_uid, p_pickup_stop_id, p_dropoff_stop_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Cancel a booking (SRS §6.2). Up to 2 hours before departure it's free and the
-- seat simply frees up; later it's a "late" cancellation that stays in the
-- payment journal. Returns 'cancelled' or 'late_cancelled'.
create or replace function public.cancel_booking(p_booking_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booking  public.bookings;
  v_depart   timestamptz;
  v_status   text;
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

-- All of the signed-in passenger's bookings with ride and driver details
-- (My Rides, history and payment tracking).
create or replace function public.my_bookings()
returns table (
  booking_id      uuid,
  route_id        uuid,
  ride_date       date,
  status          text,
  is_paid         boolean,
  ride_cancelled  boolean,
  kind            text,
  origin          text,
  destination     text,
  out_time        time,
  departure_at    timestamptz,
  price           numeric,
  pickup_label    text,
  dropoff_label   text,
  driver_id       uuid,
  driver_name     text,
  driver_phone    text,
  driver_email    text
)
language sql stable
security definer set search_path = ''
as $$
  select b.id, b.route_id, b.ride_date, b.status, b.is_paid, coalesce(x.cancelled, false),
         r.kind, g.origin, g.destination,
         coalesce(x.out_time, r.out_time),
         public.departure_at(b.ride_date, coalesce(x.out_time, r.out_time)),
         r.price, ps.label, ds.label,
         r.driver_id, p.full_name, p.phone, p.email
  from public.bookings b
  join public.routes r on r.id = b.route_id
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  join public.stops ps on ps.id = b.pickup_stop_id
  join public.stops ds on ds.id = b.dropoff_stop_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = b.ride_date
  where b.passenger_id = auth.uid()
  order by b.ride_date, coalesce(x.out_time, r.out_time)
$$;

revoke execute on function public.search_rides, public.get_ride, public.book_ride,
  public.cancel_booking, public.my_bookings from anon, public;
grant execute on function public.search_rides, public.get_ride, public.book_ride,
  public.cancel_booking, public.my_bookings to authenticated;

-- ─── Starter groups ──────────────────────────────────────────────────────────

insert into public.ride_groups (origin, destination) values
  ('בית שמש', 'ירושלים'),
  ('בית שמש', 'הר חוצבים'),
  ('רמת בית שמש', 'ירושלים')
on conflict (origin, destination) do nothing;
