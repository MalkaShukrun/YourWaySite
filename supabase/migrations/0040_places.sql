-- YourWay — one list of places; a ride group goes from one place to another.
-- Run after 0039_group_neighborhood_required.sql. Safe to run again.
--
-- A place is a city and a neighborhood or area inside it ("בית שמש, רמה ג").
-- Admins keep the list on group management, and a group picks its origin and
-- destination from it (origin_place_id, destination_place_id), so the same
-- place is always written the same way. Renaming a place renames it in every
-- group that uses it. A place a group uses can't be deleted.
--
-- The group's own name columns (origin, destination and their city and
-- neighborhood, 0038) stay, filled from its places by the database, so every
-- function that shows a group's name is unchanged.
--
-- Existing groups get their places from their current names: each different
-- city + neighborhood becomes one place.

-- ─── Places ──────────────────────────────────────────────────────────────────

create table if not exists public.places (
  id           uuid primary key default gen_random_uuid(),
  city         text not null,
  neighborhood text not null,
  name         text generated always as (city || ', ' || neighborhood) stored,
  created_at   timestamptz not null default now(),
  unique (city, neighborhood),
  -- Trimmed, so the same place can't be added twice with other spacing; no
  -- comma in the city, so "city, neighborhood" always splits back the same.
  constraint places_names check (
    char_length(city) between 2 and 40 and char_length(neighborhood) between 2 and 40
    and city = btrim(city) and neighborhood = btrim(neighborhood)
    and position(',' in city) = 0
  )
);

alter table public.places enable row level security;

-- Like the groups: everyone signed in can read; only admins write.
drop policy if exists "Read places" on public.places;
create policy "Read places" on public.places for select to authenticated using (true);
drop policy if exists "Admins manage places" on public.places;
create policy "Admins manage places" on public.places for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.places (city, neighborhood)
select distinct v.city, v.neighborhood
from public.ride_groups g
cross join lateral (values (g.origin_city, g.origin_neighborhood),
                           (g.destination_city, g.destination_neighborhood)) v (city, neighborhood)
on conflict (city, neighborhood) do nothing;

-- ─── Groups ──────────────────────────────────────────────────────────────────

-- 0038 split the names the group was given; now they come from its places.
drop trigger if exists ride_groups_places on public.ride_groups;
drop function if exists public.ride_group_places();

alter table public.ride_groups
  add column if not exists origin_place_id      uuid references public.places (id),
  add column if not exists destination_place_id uuid references public.places (id);

update public.ride_groups g
set origin_place_id = o.id, destination_place_id = d.id
from public.places o, public.places d
where (g.origin_place_id is null or g.destination_place_id is null)
  and o.city = g.origin_city and o.neighborhood = g.origin_neighborhood
  and d.city = g.destination_city and d.neighborhood = g.destination_neighborhood;

alter table public.ride_groups
  alter column origin_place_id      set not null,
  alter column destination_place_id set not null;

alter table public.ride_groups drop constraint if exists ride_groups_place_pair;
alter table public.ride_groups add constraint ride_groups_place_pair unique (origin_place_id, destination_place_id);
alter table public.ride_groups drop constraint if exists ride_groups_places_differ;
alter table public.ride_groups add constraint ride_groups_places_differ check (origin_place_id <> destination_place_id);

-- The unique key above covers looking up by origin; this one, by destination
-- (deleting a place checks both).
create index if not exists ride_groups_destination_place on public.ride_groups (destination_place_id);

-- A group's names, always from its places.
create or replace function public.ride_group_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select city, neighborhood, name into new.origin_city, new.origin_neighborhood, new.origin
  from public.places where id = new.origin_place_id;
  select city, neighborhood, name into new.destination_city, new.destination_neighborhood, new.destination
  from public.places where id = new.destination_place_id;
  return new;
end;
$$;

revoke execute on function public.ride_group_names from anon, authenticated, public;

drop trigger if exists ride_groups_names on public.ride_groups;
create trigger ride_groups_names
  before insert or update on public.ride_groups
  for each row execute function public.ride_group_names();

-- A renamed place renames the groups that use it (the trigger above refills them).
create or replace function public.rename_place_groups()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.ride_groups set origin_place_id = origin_place_id
  where origin_place_id = new.id or destination_place_id = new.id;
  return null;
end;
$$;

revoke execute on function public.rename_place_groups from anon, authenticated, public;

drop trigger if exists places_rename_groups on public.places;
create trigger places_rename_groups
  after update of city, neighborhood on public.places
  for each row execute function public.rename_place_groups();
