-- YourWay — Driver Hub (SRS §5, §6.1). Run after 0002_rides.sql.

-- Stops that bookings still point at can't be deleted, so removing them from a
-- route archives them instead.
alter table public.stops add column if not exists is_active boolean not null default true;

-- Booking only accepts active stops.
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

  if not exists (select 1 from public.stops where id = p_pickup_stop_id and route_id = p_route_id
                 and kind = 'pickup' and is_active)
     or not exists (select 1 from public.stops where id = p_dropoff_stop_id and route_id = p_route_id
                    and kind = 'dropoff' and is_active) then
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

-- The signed-in driver's rides on a date (daily dashboard, SRS §5.2).
create or replace function public.driver_rides(p_date date)
returns table (
  route_id           uuid,
  kind               text,
  origin             text,
  destination        text,
  out_time           time,
  scheduled_out_time time,
  return_time        time,
  seats              smallint,
  price              numeric,
  cancelled          boolean,
  booked             integer
)
language sql stable
security definer set search_path = ''
as $$
  select r.id, r.kind, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.out_time, r.return_time, r.seats, r.price,
         coalesce(x.cancelled, false),
         (select count(*) from public.bookings b
          where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where r.driver_id = auth.uid() and r.is_active and public.route_runs_on(r, p_date)
  order by coalesce(x.out_time, r.out_time)
$$;

-- Passengers booked on the signed-in driver's rides on a date, with their
-- contact details and stops (SRS §2, §5.2).
create or replace function public.driver_passengers(p_date date)
returns table (
  booking_id       uuid,
  route_id         uuid,
  passenger_id     uuid,
  passenger_name   text,
  passenger_phone  text,
  passenger_email  text,
  pickup_stop_id   uuid,
  pickup_label     text,
  pickup_lat       double precision,
  pickup_lng       double precision,
  pickup_position  smallint,
  dropoff_stop_id  uuid,
  dropoff_label    text,
  dropoff_lat      double precision,
  dropoff_lng      double precision,
  dropoff_position smallint
)
language sql stable
security definer set search_path = ''
as $$
  select b.id, b.route_id, p.id, p.full_name, p.phone, p.email,
         ps.id, ps.label, ps.lat, ps.lng, ps.position,
         ds.id, ds.label, ds.lat, ds.lng, ds.position
  from public.bookings b
  join public.routes r on r.id = b.route_id and r.driver_id = auth.uid()
  join public.profiles p on p.id = b.passenger_id
  join public.stops ps on ps.id = b.pickup_stop_id
  join public.stops ds on ds.id = b.dropoff_stop_id
  where b.ride_date = p_date and b.status = 'active'
  order by b.created_at
$$;

-- Create or update a route and its stops in one transaction (SRS §5.1).
-- Runs as the caller, so RLS limits it to the driver's own routes.
create or replace function public.save_route(p_route_id uuid, p_route jsonb, p_stops jsonb)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_id        uuid;
  v_weekdays  smallint[];
  v_stop      jsonb;
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
      p_route ->> 'kind',
      case when p_route ->> 'kind' = 'recurring' then v_weekdays else '{}' end,
      case when p_route ->> 'kind' = 'one_time' then (p_route ->> 'ride_date')::date end,
      (p_route ->> 'out_time')::time,
      nullif(p_route ->> 'return_time', '')::time,
      (p_route ->> 'seats')::smallint,
      (p_route ->> 'price')::numeric
    )
    returning id into v_id;
  else
    update public.routes set
      group_id    = (p_route ->> 'group_id')::uuid,
      kind        = p_route ->> 'kind',
      weekdays    = case when p_route ->> 'kind' = 'recurring' then v_weekdays else '{}' end,
      ride_date   = case when p_route ->> 'kind' = 'one_time' then (p_route ->> 'ride_date')::date end,
      out_time    = (p_route ->> 'out_time')::time,
      return_time = nullif(p_route ->> 'return_time', '')::time,
      seats       = (p_route ->> 'seats')::smallint,
      price       = (p_route ->> 'price')::numeric
    where id = p_route_id and driver_id = auth.uid() and is_active
    returning id into v_id;
    if v_id is null then raise exception 'ROUTE_NOT_FOUND'; end if;
  end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    if v_stop ->> 'kind' = 'pickup' then
      v_pickups := v_pickups + 1; v_position := v_pickups;
    else
      v_dropoffs := v_dropoffs + 1; v_position := v_dropoffs;
    end if;

    v_stop_id := nullif(v_stop ->> 'id', '')::uuid;
    if v_stop_id is not null then
      update public.stops set
        kind = v_stop ->> 'kind', label = v_stop ->> 'label',
        lat = (v_stop ->> 'lat')::double precision, lng = (v_stop ->> 'lng')::double precision,
        position = v_position, is_active = true
      where id = v_stop_id and route_id = v_id
      returning id into v_stop_id;
    end if;
    if v_stop_id is null then
      insert into public.stops (route_id, kind, label, lat, lng, position)
      values (v_id, v_stop ->> 'kind', v_stop ->> 'label',
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

revoke execute on function public.driver_rides, public.driver_passengers, public.save_route from anon, public;
grant execute on function public.driver_rides, public.driver_passengers, public.save_route to authenticated;
