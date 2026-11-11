-- YourWay — the admin page shows how many passengers joined each of the next 7 days.
-- Run after 0045_admin_email_stats.sql. Safe to run again.
--
-- One row a day from today to 6 days ahead (Israel time). Rides are counted
-- as in admin_stats' "נסיעות יוצאות היום" (0033): every scheduled ride, booked
-- or not, on a route that isn't removed, leaving out a date the driver
-- cancelled; today includes rides that already left. Seats are those rides'
-- seats, and passengers are their active bookings, guests included, so
-- someone who rides out and back counts twice.

create or replace function public.admin_upcoming_passengers()
returns table (
  day         date,
  rides       bigint,
  seats       bigint,
  passengers  bigint
)
language sql stable
security definer set search_path = ''
as $$
  with days as (
    select (public.israel_today() + n)::date as day from generate_series(0, 6) n
  ),
  rides as (
    select d.day, r.id as route_id, r.seats
    from days d
    join public.routes r on r.is_active and public.route_runs_on(r, d.day)
    where not exists (select 1 from public.ride_exceptions x
                      where x.route_id = r.id and x.ride_date = d.day and x.cancelled)
  )
  select
    d.day,
    (select count(*) from rides where rides.day = d.day),
    (select coalesce(sum(rides.seats), 0) from rides where rides.day = d.day),
    (select count(*) from public.bookings b
     join rides on rides.route_id = b.route_id and rides.day = b.ride_date
     where b.ride_date = d.day and b.status = 'active')
  from days d
  where public.is_admin()
  order by d.day
$$;

revoke execute on function public.admin_upcoming_passengers from anon, public;
grant execute on function public.admin_upcoming_passengers to authenticated;
