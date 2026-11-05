-- YourWay — each end of a ride group is a city and, optionally, a neighborhood.
-- Run after 0037_edit_unbooked_routes.sql. Safe to run again.
--
-- A group's origin and destination are now each a city (origin_city,
-- destination_city) and an optional neighborhood or area inside it
-- (origin_neighborhood, destination_neighborhood), so rides can be found by
-- either. origin / destination stay as the name shown everywhere — "city,
-- neighborhood", or the city alone — and the database keeps them in step with
-- the new columns. Every function that shows a group's name is unchanged, and
-- the (origin, destination) unique key now keeps each city + neighborhood pair
-- unique.
--
-- A writer that sets only origin / destination (the group form, tests) still
-- works: the name is split at its first comma, so "ירושלים, תלפיות" is the
-- city ירושלים and the neighborhood תלפיות; a name without a comma is a city.
--
-- Existing groups are split by the list below. Groups that come out the same
-- are merged: one keeps its id, the others' routes move to it, and it stays
-- visible if any of them was. A name not in the list is a city, like a new
-- name without a comma. A group whose two ends would be the same place stops
-- the migration and changes nothing.

alter table public.ride_groups
  add column if not exists origin_city              text,
  add column if not exists origin_neighborhood      text,
  add column if not exists destination_city         text,
  add column if not exists destination_neighborhood text;

-- ─── Existing groups ─────────────────────────────────────────────────────────

do $$
declare
  v_problem text;
begin
  if not exists (select 1 from public.ride_groups where origin_city is null) then return; end if;

  -- Each name in use → its city and neighborhood; a name not here is a city.
  -- A null city is the other end's city: "פנימי" is a ride inside the
  -- origin's city, so "בית שמש ← פנימי" is "בית שמש ← בית שמש, פנימי".
  create temp table place_map (place text primary key, city text, neighborhood text) on commit drop;
  insert into place_map (place, city, neighborhood) values
    ('בית שמש',             'בית שמש',            null),
    ('בית שמש רמה א',       'בית שמש',            'רמה א'),
    ('בית שמש רמה ב',       'בית שמש',            'רמה ב'),
    ('בית שמש רמה ג',       'בית שמש',            'רמה ג'),
    ('רמת בית שמש ג',       'בית שמש',            'רמה ג'),
    ('בית שמש רמה ד',       'בית שמש',            'רמה ד'),
    ('בית שמש רמת אברהם',   'בית שמש',            'רמת אברהם'),
    ('רמת בית שמש',         'בית שמש',            'רמה ג'),
    ('הרטוב',               'בית שמש',            'אזור התעשייה הר טוב'),
    ('ירושלים',             'ירושלים',            null),
    ('גבעת שאול',           'ירושלים',            'גבעת שאול'),
    ('הר חוצבים',           'ירושלים',            'הר חוצבים'),
    ('נווה יעקב',           'ירושלים',            'נווה יעקב'),
    ('תלפיות',              'ירושלים',            'תלפיות'),
    ('קניון מלחה',          'ירושלים',            'קניון מלחה'),
    ('כניסה לעיר ירושלים',  'ירושלים',            'כניסה לעיר'),
    ('בני ברק',             'בני ברק',            null),
    ('ראשון לציון',         'ראשון לציון',        null),
    ('מודיעין',             'מודיעין-מכבים-רעות', null),
    ('טלז סטון',            'קריית יערים',        null),
    ('פנימי',               null,                 'פנימי');

  create temp table group_places on commit drop as
  select g.id, g.is_active, g.created_at,
         coalesce(o.city, d.city) as origin_city,      o.neighborhood as origin_neighborhood,
         coalesce(d.city, o.city) as destination_city, d.neighborhood as destination_neighborhood,
         (select count(*) from public.routes r where r.group_id = g.id) as route_count,
         null::uuid as keep_id
  from public.ride_groups g
  cross join lateral (
    select m.city, m.neighborhood from place_map m where m.place = g.origin
    union all select g.origin, null where not exists (select 1 from place_map m where m.place = g.origin)
  ) o
  cross join lateral (
    select m.city, m.neighborhood from place_map m where m.place = g.destination
    union all select g.destination, null where not exists (select 1 from place_map m where m.place = g.destination)
  ) d
  where g.origin_city is null;

  select string_agg(g.origin || ' ← ' || g.destination, ', ') into v_problem
  from group_places p join public.ride_groups g on g.id = p.id
  where p.origin_city is not distinct from p.destination_city
    and p.origin_neighborhood is not distinct from p.destination_neighborhood;
  if v_problem is not null then
    raise exception 'Groups whose two ends would be the same place: %', v_problem;
  end if;

  -- The group each one merges into: a visible one, then the one with the most
  -- routes, then the oldest.
  update group_places p set keep_id = k.keep_id
  from (
    select id, first_value(id) over (
             partition by origin_city, origin_neighborhood, destination_city, destination_neighborhood
             order by is_active desc, route_count desc, created_at, id) as keep_id
    from group_places
  ) k
  where k.id = p.id;

  -- No signed-in user here, so the route locks (0037) let this through.
  update public.routes r set group_id = p.keep_id
  from group_places p
  where r.group_id = p.id and p.id <> p.keep_id;

  delete from public.ride_groups g
  using group_places p
  where g.id = p.id and p.id <> p.keep_id;

  update public.ride_groups g
  set origin_city              = p.origin_city,
      origin_neighborhood      = p.origin_neighborhood,
      destination_city         = p.destination_city,
      destination_neighborhood = p.destination_neighborhood,
      origin                   = p.origin_city || coalesce(', ' || p.origin_neighborhood, ''),
      destination              = p.destination_city || coalesce(', ' || p.destination_neighborhood, ''),
      is_active                = (select bool_or(m.is_active) from group_places m where m.keep_id = p.id)
  from group_places p
  where g.id = p.id;
end;
$$;

-- ─── Rules ───────────────────────────────────────────────────────────────────

alter table public.ride_groups
  alter column origin_city      set not null,
  alter column destination_city set not null;

-- Replaces 0015's check on the names. It keeps its name, so running 0015 again
-- and then this file leaves this one.
alter table public.ride_groups drop constraint if exists ride_groups_names;
alter table public.ride_groups add constraint ride_groups_names check (
  char_length(origin_city) between 2 and 40 and char_length(destination_city) between 2 and 40
  and (origin_neighborhood is null or char_length(origin_neighborhood) between 2 and 40)
  and (destination_neighborhood is null or char_length(destination_neighborhood) between 2 and 40)
  and position(',' in origin_city) = 0 and position(',' in destination_city) = 0
  and origin <> destination
);

-- Keeps origin / destination and the four place columns in step. A name that
-- changes while its city and neighborhood don't is split at its first comma.
create or replace function public.ride_group_places()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_split_origin      boolean;
  v_split_destination boolean;
begin
  v_split_origin := new.origin_city is null;
  v_split_destination := new.destination_city is null;
  if tg_op = 'UPDATE' then
    v_split_origin := v_split_origin or (new.origin is distinct from old.origin
      and (new.origin_city, new.origin_neighborhood) is not distinct from (old.origin_city, old.origin_neighborhood));
    v_split_destination := v_split_destination or (new.destination is distinct from old.destination
      and (new.destination_city, new.destination_neighborhood) is not distinct from (old.destination_city, old.destination_neighborhood));
  end if;

  if v_split_origin then
    new.origin_city := split_part(new.origin, ',', 1);
    new.origin_neighborhood := substr(new.origin, nullif(position(',' in new.origin), 0) + 1);
  end if;
  if v_split_destination then
    new.destination_city := split_part(new.destination, ',', 1);
    new.destination_neighborhood := substr(new.destination, nullif(position(',' in new.destination), 0) + 1);
  end if;

  new.origin_city := btrim(new.origin_city);
  new.origin_neighborhood := nullif(btrim(new.origin_neighborhood), '');
  new.destination_city := btrim(new.destination_city);
  new.destination_neighborhood := nullif(btrim(new.destination_neighborhood), '');
  new.origin := new.origin_city || coalesce(', ' || new.origin_neighborhood, '');
  new.destination := new.destination_city || coalesce(', ' || new.destination_neighborhood, '');
  return new;
end;
$$;

revoke execute on function public.ride_group_places from anon, authenticated, public;

drop trigger if exists ride_groups_places on public.ride_groups;
create trigger ride_groups_places
  before insert or update on public.ride_groups
  for each row execute function public.ride_group_places();
