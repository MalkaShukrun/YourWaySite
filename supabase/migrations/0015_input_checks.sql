-- YourWay — the form limits, enforced by the database too.
-- Run after 0014_replace_guest_booking.sql. Safe to run again.
--
-- Users write some columns straight through the API (profiles via column
-- grants; drivers their routes and stops; admins the groups), so the checks
-- in lib/validation/* alone can be skipped. These match them:
--   profiles   full_name ≤ 60, phone in PHONE_PATTERN, vehicle model ≤ 40, color ≤ 20
--   stops      label 2–60
--   ride_groups origin / destination 2–40, different from each other
--   routes     weekdays 0–6, each once
-- Each check is added NOT VALID — new and changed rows must pass it — and then
-- validated; if old rows don't pass, it stays NOT VALID and a notice says so.

-- ─── Sign-up ─────────────────────────────────────────────────────────────────

-- The Google name may be longer than the profile allows; keep the first 60
-- characters. The user can edit it at onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(btrim(regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
      '[[:cntrl:]]', '', 'g')), 60),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

update public.profiles set full_name = left(btrim(full_name), 60) where char_length(full_name) > 60;

-- ─── Checks ──────────────────────────────────────────────────────────────────

-- Days of the week, each at most once. A function, since a check can't hold a
-- subquery.
create or replace function public.valid_weekdays(p_days smallint[])
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(bool_and(d between 0 and 6), true) and count(*) = count(distinct d)
  from unnest(p_days) d
$$;

alter table public.profiles drop constraint if exists profiles_details;
alter table public.profiles add constraint profiles_details check (
  char_length(full_name) <= 60 and full_name !~ '[[:cntrl:]]'
  and (phone is null or phone ~ '^0\d{1,2}-?\d{3}-?\d{4}$')
  and (vehicle_model is null or char_length(vehicle_model) between 1 and 40)
  and (vehicle_color is null or char_length(vehicle_color) between 1 and 20)
) not valid;

alter table public.stops drop constraint if exists stops_label;
alter table public.stops add constraint stops_label check (
  char_length(label) between 2 and 60 and label !~ '[[:cntrl:]]'
) not valid;

alter table public.ride_groups drop constraint if exists ride_groups_names;
alter table public.ride_groups add constraint ride_groups_names check (
  char_length(origin) between 2 and 40 and char_length(destination) between 2 and 40
  and origin <> destination
) not valid;

alter table public.routes drop constraint if exists routes_weekdays;
alter table public.routes add constraint routes_weekdays check (public.valid_weekdays(weekdays)) not valid;

do $$
declare
  v_check record;
begin
  for v_check in
    select * from (values ('profiles', 'profiles_details'), ('stops', 'stops_label'),
                          ('ride_groups', 'ride_groups_names'), ('routes', 'routes_weekdays')) c(tbl, name)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', v_check.tbl, v_check.name);
    exception when check_violation then
      raise notice '% has rows that break %: fix them, then run "alter table public.% validate constraint %;"',
        v_check.tbl, v_check.name, v_check.tbl, v_check.name;
    end;
  end loop;
end;
$$;
