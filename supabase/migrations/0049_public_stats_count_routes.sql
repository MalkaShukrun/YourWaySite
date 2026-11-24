-- YourWay — the login page's "קווי נסיעה פעילים" counts active routes, as the admin page does.
-- Run after 0048_edit_unused_stops.sql. Safe to run again.
--
-- Until now (0041) the login page counted ride groups that had at least one
-- active route, so two drivers on "בית שמש ← ירושלים" counted once, while the
-- admin page counted both. Now both count every active route in a shown group:
-- not removed, and not a one-time ride that took place or was cancelled for
-- its date — as in the driver's "מסלולים פעילים" tab.

create or replace function public.public_stats()
returns table (members bigint, routes bigint)
language sql stable
security definer set search_path = ''
as $$
  select
    -- Members who finished sign-up (a phone is required to finish it).
    (select count(*) from public.profiles where phone is not null),
    -- Active routes in shown ride groups.
    (select count(*) from public.routes r
     join public.ride_groups g on g.id = r.group_id
     where g.is_active and r.is_active
       and (r.kind = 'recurring'
            or (public.departure_at(r.ride_date, r.out_time) > now()
                and not exists (select 1 from public.ride_exceptions x
                                where x.route_id = r.id and x.ride_date = r.ride_date and x.cancelled))))
$$;

revoke execute on function public.public_stats from public;
grant execute on function public.public_stats to anon, authenticated;
