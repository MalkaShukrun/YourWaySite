-- YourWay — a one-time ride that has already left stays in the driver's history.
-- Run after 0023_no_cancel_after_departure.sql. Safe to run again.
--
-- Removing a route takes it off the schedule (is_active → false), which also
-- dropped a ride that already happened from the driver's history. A one-time
-- ride can no longer be removed once its date and departure time have passed.
-- The service role and the SQL editor (no signed-in user) are not limited,
-- for maintenance.

create or replace function public.keep_past_ride()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or not (old.is_active and not new.is_active and old.kind = 'one_time') then
    return new;
  end if;
  if public.departure_at(old.ride_date, old.out_time) <= now() then raise exception 'RIDE_PAST'; end if;
  return new;
end;
$$;

revoke execute on function public.keep_past_ride from anon, authenticated, public;

drop trigger if exists routes_keep_past_ride on public.routes;
create trigger routes_keep_past_ride
  before update on public.routes
  for each row execute function public.keep_past_ride();
