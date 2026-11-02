-- YourWay — site-wide totals on the admin page.
-- Run after 0032_personal_codes.sql. Safe to run again.
--
-- Bookings' access rules don't let an admin read other people's bookings, and
-- this shouldn't change that: the function returns totals only, to admins only.
--
-- A booking is one passenger on one ride, guests included, so someone who rides
-- out and back counts twice. A date the driver cancelled keeps its bookings
-- active (ride_exceptions), so it's left out explicitly. A ride that departed
-- with nobody booked leaves no trace and isn't counted: past dates of a
-- recurring route can't be rebuilt from today's schedule.

create or replace function public.admin_stats()
returns table (
  users                bigint,
  rides_today          bigint,
  passengers_today     bigint,
  rides_departed       bigint,
  passengers_departed  bigint
)
language sql stable
security definer set search_path = ''
as $$
  with onboard as (
    select b.route_id, b.ride_date,
           public.departure_at(b.ride_date, r.out_time) <= now() as departed
    from public.bookings b
    join public.routes r on r.id = b.route_id
    where b.status = 'active'
      and not exists (select 1 from public.ride_exceptions x
                      where x.route_id = b.route_id and x.ride_date = b.ride_date and x.cancelled)
  )
  select
    -- Members who finished sign-up, as on the login page (public_stats).
    (select count(*) from public.profiles where phone is not null),
    -- Scheduled today, booked or not, including those that already left.
    (select count(*) from public.routes r
     where r.is_active and public.route_runs_on(r, public.israel_today())
       and not exists (select 1 from public.ride_exceptions x
                       where x.route_id = r.id and x.ride_date = public.israel_today() and x.cancelled)),
    (select count(*) from onboard where ride_date = public.israel_today()),
    (select count(distinct (route_id, ride_date)) from onboard where departed),
    (select count(*) from onboard where departed)
  where public.is_admin()
$$;

revoke execute on function public.admin_stats from anon, public;
grant execute on function public.admin_stats to authenticated;
