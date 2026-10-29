-- YourWay — the login page shows two totals: members and active routes.
-- Run after 0016_public_stats.sql. Safe to run again.
--
-- The returned columns change, which create or replace can't do, so the
-- function is dropped and created again.

drop function if exists public.public_stats();

create function public.public_stats()
returns table (members bigint, routes bigint)
language sql stable
security definer set search_path = ''
as $$
  select
    -- Members who finished sign-up (a phone is required to finish it).
    (select count(*) from public.profiles where phone is not null),
    -- Active ride groups ("בית שמש ← ירושלים") — the routes in the search filter.
    (select count(*) from public.ride_groups where is_active)
$$;

revoke execute on function public.public_stats from public;
grant execute on function public.public_stats to anon, authenticated;
