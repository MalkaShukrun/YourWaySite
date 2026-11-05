-- YourWay — both ends of every ride group have a neighborhood.
-- Run after 0038_group_cities_and_neighborhoods.sql. Safe to run again.
--
-- 0038 let a place be a city alone ("בית שמש"). Now each end is a city and a
-- neighborhood or area inside it ("בית שמש, רמה ג"). Give the groups that
-- still lack one a neighborhood first, on group management (עריכה, then
-- "city, neighborhood"): until then this stops, lists them and changes nothing.

do $$
declare
  v_missing text;
begin
  select string_agg(origin || ' ← ' || destination, E'\n' order by origin, destination) into v_missing
  from public.ride_groups
  where origin_neighborhood is null or destination_neighborhood is null;
  if v_missing is not null then
    raise exception E'Groups still without a neighborhood. Add one on group management, then run this again:\n%', v_missing;
  end if;
end;
$$;

-- Replaces 0038's check, under the same name. A missing neighborhood counts
-- as length 0, so it fails here like a too-short one.
alter table public.ride_groups drop constraint if exists ride_groups_names;
alter table public.ride_groups add constraint ride_groups_names check (
  char_length(origin_city) between 2 and 40 and char_length(destination_city) between 2 and 40
  and coalesce(char_length(origin_neighborhood), 0) between 2 and 40
  and coalesce(char_length(destination_neighborhood), 0) between 2 and 40
  and position(',' in origin_city) = 0 and position(',' in destination_city) = 0
  and origin <> destination
);
