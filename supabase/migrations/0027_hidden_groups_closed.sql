-- YourWay — rides in a hidden group can't be booked.
-- Run after 0026_no_late_cancellations.sql. Safe to run again.
--
-- Hiding a group took its rides out of search, but a ride page opened from a
-- saved link still offered booking, and book_ride accepted it. Now get_ride
-- reports such a ride as unavailable and book_ride refuses it with
-- RIDE_UNAVAILABLE. What hiding leaves alone is unchanged: existing bookings
-- stay, the driver's routes keep running on her dashboard, and she can still
-- add passengers by hand (add_passenger).

create or replace function public.book_ride(
  p_route_id uuid, p_date date, p_pickup_stop_id uuid, p_dropoff_stop_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_route public.routes;
  v_taken integer;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into v_route from public.routes where id = p_route_id for update;
  if not found or not v_route.is_active or not public.route_runs_on(v_route, p_date)
     or not exists (select 1 from public.ride_groups where id = v_route.group_id and is_active) then
    raise exception 'RIDE_UNAVAILABLE';
  end if;
  if v_route.driver_id = v_uid then raise exception 'OWN_RIDE'; end if;
  if exists (select 1 from public.ride_exceptions
             where route_id = p_route_id and ride_date = p_date and cancelled)
     or public.departure_at(p_date, v_route.out_time) <= now() then
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

-- Same as in 0011, with the group's is_active in is_available.
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
  notes           text,
  is_available    boolean,
  my_booking_id   uuid
)
language sql stable
security definer set search_path = ''
as $$
  with mine as (
    select b.id from public.bookings b
    where b.route_id = p_route_id and b.ride_date = p_date
      and b.passenger_id = auth.uid() and b.status = 'active'
  )
  select r.id, p_date, r.kind, r.driver_id, p.full_name,
         case when exists (select 1 from mine) then p.phone end,
         case when exists (select 1 from mine) then p.email end,
         p.vehicle_model, p.vehicle_color, g.origin, g.destination,
         r.out_time, r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer,
         r.price, r.notes,
         r.is_active and g.is_active and public.route_runs_on(r, p_date) and coalesce(x.cancelled, false) = false
           and public.departure_at(p_date, r.out_time) > now(),
         (select id from mine)
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where auth.uid() is not null and r.id = p_route_id
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.book_ride, public.get_ride from anon, public;
grant execute on function public.book_ride, public.get_ride to authenticated;
