-- YourWay — a ride's price is fixed once it has departed.
-- Run after 0018_cancel_off_schedule_bookings.sql. Safe to run again.
--
-- Payments used the route's current price, so when the driver changed it,
-- rides already taken changed amount too. Each booking now keeps its own
-- price: set from the route when it's made, and kept in step with the route
-- until the ride departs. After that a price change no longer reaches it.

alter table public.bookings add column if not exists price numeric;

-- Bookings made before this take the route's price now: the price they were
-- charged at before wasn't saved.
update public.bookings b set price = r.price
from public.routes r
where r.id = b.route_id and b.price is null;

alter table public.bookings alter column price set not null;

-- Whoever makes the booking, the price comes from the route.
create or replace function public.set_booking_price()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  select r.price into new.price from public.routes r where r.id = new.route_id;
  return new;
end;
$$;

revoke execute on function public.set_booking_price from anon, authenticated, public;

drop trigger if exists bookings_set_price on public.bookings;
create trigger bookings_set_price
  before insert on public.bookings
  for each row execute function public.set_booking_price();

-- A new route price reaches the bookings whose ride hasn't departed yet.
create or replace function public.update_upcoming_booking_prices()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.bookings b set price = new.price
  where b.route_id = new.id
    and public.departure_at(b.ride_date, coalesce(
          (select x.out_time from public.ride_exceptions x
           where x.route_id = b.route_id and x.ride_date = b.ride_date),
          new.out_time)) > now();
  return null;
end;
$$;

revoke execute on function public.update_upcoming_booking_prices from anon, authenticated, public;

drop trigger if exists routes_update_upcoming_booking_prices on public.routes;
create trigger routes_update_upcoming_booking_prices
  after update of price on public.routes
  for each row when (old.price is distinct from new.price)
  execute function public.update_upcoming_booking_prices();

-- The payments journal reads the booking's own price.
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
         b.price, ps.label, ds.label,
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
