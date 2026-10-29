-- YourWay — a driver's phone and email only for passengers still on the ride.
-- Run after 00081_remove_bank_details.sql. Safe to run again.
--
-- my_bookings returned the driver's contact details for every booking the
-- passenger ever made, including ones cancelled in time. Now, like get_ride
-- (0007), they go only with active bookings and late cancellations (the
-- passenger still pays the driver for those). Passengers' own phones already
-- reach only the driver of the ride they booked (driver_passengers, 0003).

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
         r.driver_id, p.full_name,
         case when b.status in ('active', 'late_cancelled') then p.phone end,
         case when b.status in ('active', 'late_cancelled') then p.email end
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

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.my_bookings from anon, public;
grant execute on function public.my_bookings to authenticated;
