-- YourWay — bookings on dates a ride no longer runs are cancelled by the driver.
-- Run after 0017_public_stats_routes.sql. Safe to run again.
--
-- A booking keeps the date it was made for. When the driver moved a one-time
-- ride, dropped a weekday or a start date from a recurring one, or stopped
-- offering the route, its upcoming bookings stayed active on dates the ride
-- no longer ran: they moved to the passenger's history once the date passed
-- and were charged in her payments.
--
-- Now those dates are marked cancelled for the ride (ride_exceptions), as if
-- the driver had used "cancel for this date only": the passenger sees "הנהגת
-- ביטלה את הנסיעה" and isn't charged. Rides that already departed are left
-- as they were.

create or replace function public.cancel_off_schedule_bookings(p_route_id uuid)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.ride_exceptions (route_id, ride_date, cancelled)
  select distinct b.route_id, b.ride_date, true
  from public.bookings b
  join public.routes r on r.id = b.route_id
  where b.route_id = p_route_id
    and b.status = 'active'
    and public.departure_at(b.ride_date, coalesce(
          (select x.out_time from public.ride_exceptions x
           where x.route_id = b.route_id and x.ride_date = b.ride_date),
          r.out_time)) > now()
    and (not r.is_active or not public.route_runs_on(r, b.ride_date))
  on conflict (route_id, ride_date) do update set cancelled = true
$$;

revoke execute on function public.cancel_off_schedule_bookings from anon, authenticated, public;

-- Runs on every change to when a route runs, from the route editor
-- (save_route) or when the driver stops offering it.
create or replace function public.cancel_off_schedule_bookings_trigger()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.cancel_off_schedule_bookings(new.id);
  return null;
end;
$$;

revoke execute on function public.cancel_off_schedule_bookings_trigger from anon, authenticated, public;

drop trigger if exists routes_cancel_off_schedule_bookings on public.routes;
create trigger routes_cancel_off_schedule_bookings
  after update of kind, weekdays, ride_date, is_active on public.routes
  for each row execute function public.cancel_off_schedule_bookings_trigger();

-- Bookings already left on dates their ride no longer runs.
select public.cancel_off_schedule_bookings(id) from public.routes;
