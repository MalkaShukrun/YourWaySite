-- YourWay — marking stops on the map is optional (SRS §5.1): a stop may have
-- just a name. save_route already passes missing coordinates through as null.
-- Run after 0004_profile.sql. Safe to run again.

alter table public.stops
  alter column lat drop not null,
  alter column lng drop not null;

-- A stop is either on the map (both coordinates) or not at all.
alter table public.stops drop constraint if exists stops_location_complete;
alter table public.stops
  add constraint stops_location_complete check ((lat is null) = (lng is null));
