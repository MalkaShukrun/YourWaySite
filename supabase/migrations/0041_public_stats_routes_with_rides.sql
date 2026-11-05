-- YourWay — the login page's route total counts only routes that have a ride.
-- Run after 0040_places.sql. Safe to run again.
--
-- A route ("בית שמש ← ירושלים", a shown ride group) is counted when at least
-- one of its rides is still active, as in the driver's "מסלולים פעילים" tab
-- and on the admin page: not removed, and not a one-time ride that took place
-- or was cancelled for its date. Groups nobody drives on are left out.

create or replace function public.public_stats()
returns table (members bigint, routes bigint)
language sql stable
security definer set search_path = ''
as $$
  select
    -- Members who finished sign-up (a phone is required to finish it).
    (select count(*) from public.profiles where phone is not null),
    -- Shown ride groups with at least one active ride.
    (select count(*) from public.ride_groups g
     where g.is_active
       and exists (
         select 1 from public.routes r
         where r.group_id = g.id and r.is_active
           and (r.kind = 'recurring'
                or (public.departure_at(r.ride_date, r.out_time) > now()
                    and not exists (select 1 from public.ride_exceptions x
                                    where x.route_id = r.id and x.ride_date = r.ride_date and x.cancelled)))))
$$;

revoke execute on function public.public_stats from public;
grant execute on function public.public_stats to anon, authenticated;
