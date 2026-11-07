-- YourWay — the admin page's daily charts also show how many passengers rode each day.
-- Run after 0043_ride_emails.sql. Safe to run again.
--
-- Counted as in admin_stats' "טרמפיסטיות שנסעו עד היום" (0033): each active
-- booking on a ride that has departed, guests included, so someone who rides
-- out and back counts twice. A date the driver cancelled is left out. Today
-- counts only the rides that have left so far.

-- The returned columns change, which "create or replace" can't do.
drop function if exists public.admin_daily_stats(date);

create function public.admin_daily_stats(p_from date)
returns table (
  day                  date,
  new_users            bigint,
  visitors             bigint,
  non_driver_visitors  bigint,
  passengers           bigint
)
language sql stable
security definer set search_path = ''
as $$
  select
    d.day,
    (select count(*) from public.profiles p
     where p.phone is not null and (p.created_at at time zone 'Asia/Jerusalem')::date = d.day),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null
       and not exists (select 1 from public.routes r
                       where r.driver_id = v.user_id
                         and (r.created_at at time zone 'Asia/Jerusalem')::date <= d.day)),
    (select count(*) from public.bookings b
     join public.routes r on r.id = b.route_id
     where b.ride_date = d.day and b.status = 'active'
       and public.departure_at(b.ride_date, r.out_time) <= now()
       and not exists (select 1 from public.ride_exceptions x
                       where x.route_id = b.route_id and x.ride_date = b.ride_date and x.cancelled))
  from (select g::date as day from generate_series(p_from, public.israel_today(), interval '1 day') g) d
  where public.is_admin()
  order by d.day
$$;

revoke execute on function public.admin_daily_stats from anon, public;
grant execute on function public.admin_daily_stats to authenticated;
