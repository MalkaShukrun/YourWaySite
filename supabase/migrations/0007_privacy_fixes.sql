-- YourWay — tighter access to contact details, bank details and routes.
-- Run after 0006_profile_email.sql. Safe to run again.

-- 1. A driver's phone and email go only to passengers booked on that ride
--    (privacy policy §4). Everyone else still sees her name and vehicle.
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
  with mine as (
    select b.id from public.bookings b
    where b.route_id = p_route_id and b.ride_date = p_date
      and b.passenger_id = auth.uid() and b.status = 'active'
  )
  select r.id, p_date, r.kind, r.driver_id, p.full_name,
         case when exists (select 1 from mine) then p.phone end,
         case when exists (select 1 from mine) then p.email end,
         p.vehicle_model, p.vehicle_color, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer,
         r.price,
         r.is_active and public.route_runs_on(r, p_date) and coalesce(x.cancelled, false) = false
           and public.departure_at(p_date, coalesce(x.out_time, r.out_time)) > now(),
         (select id from mine)
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where auth.uid() is not null and r.id = p_route_id
$$;

-- 2. Drivers create and edit their own routes but can't delete them: deleting
--    would also delete passengers' bookings and payment history. Routes are
--    archived instead (is_active = false).
drop policy if exists "Drivers manage own routes" on public.routes;
drop policy if exists "Drivers add own routes" on public.routes;
create policy "Drivers add own routes" on public.routes for insert to authenticated
  with check (driver_id = (select auth.uid()));
drop policy if exists "Drivers edit own routes" on public.routes;
create policy "Drivers edit own routes" on public.routes for update to authenticated
  using (driver_id = (select auth.uid())) with check (driver_id = (select auth.uid()));
revoke delete on public.routes from authenticated, anon;

-- 3. Bank details only for rides the passenger pays for: active bookings and
--    late cancellations — not a booking cancelled in time.
create or replace function public.my_drivers_bank()
returns table (
  driver_id          uuid,
  bank_account_name  text,
  bank_name          text,
  bank_branch        text,
  bank_account       text
)
language sql stable
security definer set search_path = ''
as $$
  select p.id, p.bank_account_name, p.bank_name, p.bank_branch, p.bank_account
  from public.profiles p
  where p.bank_account is not null
    and exists (
      select 1 from public.bookings b
      join public.routes r on r.id = b.route_id
      where b.passenger_id = auth.uid() and r.driver_id = p.id
        and b.status in ('active', 'late_cancelled')
    )
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.get_ride, public.my_drivers_bank from anon, public;
grant execute on function public.get_ride, public.my_drivers_bank to authenticated;
