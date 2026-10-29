-- YourWay — site-wide counts for the login page's stats row.
-- Run after 0015_input_checks.sql. Safe to run again.
--
-- Visitors aren't signed in, and row level security hides the tables from
-- them, so the counts come from one security definer function. It returns
-- totals only — never a row, a name or an id.

create or replace function public.public_stats()
returns table (members bigint, drivers bigint, rides bigint, bookings bigint)
language sql stable
security definer set search_path = ''
as $$
  select
    -- Members who finished sign-up (a phone is required to finish it).
    (select count(*) from public.profiles where phone is not null),
    -- Drivers with at least one active route.
    (select count(distinct driver_id) from public.routes where is_active),
    -- Rides still to come: active recurring routes and one-time rides from today on.
    (select count(*) from public.routes r
       join public.ride_groups g on g.id = r.group_id and g.is_active
     where r.is_active and (r.kind = 'recurring' or r.ride_date >= public.israel_today())),
    -- Seats booked so far, not counting cancellations.
    (select count(*) from public.bookings where status = 'active')
$$;

revoke execute on function public.public_stats from public;
grant execute on function public.public_stats to anon, authenticated;
