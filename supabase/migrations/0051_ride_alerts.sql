-- YourWay — ride alerts: a passenger asks to hear when a matching ride is published.
-- Run after 0050_search_history.sql. Safe to run again.
--
-- When her search finds nothing, or only full rides, she can save an alert
-- (spec C10): the places she searched at each end — as search keeps them,
-- "city:<name>" or a place id (0050) — and optionally a date range and a
-- departure-time range. A time range may cross midnight ("22:00–02:00").
--
-- An alert expires:
-- - with a start and an end date: at the end of the end date;
-- - with a start date only: at the end of the 7th day after it;
-- - with an end date only: at the end of the end date;
-- - with no dates: 7 days after it was saved.
-- She has at most 3 alerts at a time, and no two with the same places and
-- ranges (an alert without dates and one with dates may coexist).
--
-- Only a newly published route triggers alerts — editing a route never does.
-- Publishing a route records each alert it matches (alert_matches); the Edge
-- Function that sends the other emails (supabase/functions/daily-passenger-email)
-- sends them on its 5-minute run, one email per passenger and route, listing
-- every alert of hers that route matched. Seats aren't checked again before
-- sending: the email asks her to check that a seat is still free. An expired
-- alert is deleted; no history is kept.

-- ─── Alerts ──────────────────────────────────────────────────────────────────

create table if not exists public.ride_alerts (
  id            uuid primary key default gen_random_uuid(),
  passenger_id  uuid not null references public.profiles (id) on delete cascade,
  origins       text[] not null,
  destinations  text[] not null,
  start_date    date,
  end_date      date,
  from_time     time,
  until_time    time,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint ride_alerts_places check (
    cardinality(origins) between 1 and 30 and cardinality(destinations) between 1 and 30
  ),
  constraint ride_alerts_dates check (start_date is null or end_date is null or start_date <= end_date),
  -- An empty range equals another empty one, so "nulls not distinct".
  constraint ride_alerts_unique unique nulls not distinct
    (passenger_id, origins, destinations, start_date, end_date, from_time, until_time)
);

create index if not exists ride_alerts_expires_idx on public.ride_alerts (expires_at);

-- She reads and cancels her own; saving goes through create_ride_alert below,
-- which enforces the limit.
alter table public.ride_alerts enable row level security;

drop policy if exists "ride_alerts: read own" on public.ride_alerts;
create policy "ride_alerts: read own" on public.ride_alerts
  for select to authenticated using (passenger_id = (select auth.uid()));

drop policy if exists "ride_alerts: delete own" on public.ride_alerts;
create policy "ride_alerts: delete own" on public.ride_alerts
  for delete to authenticated using (passenger_id = (select auth.uid()));

revoke all on public.ride_alerts from anon, authenticated;
grant select, delete on public.ride_alerts to authenticated;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- When an alert with these dates, saved at p_created, expires.
create or replace function public.ride_alert_expiry(p_start date, p_end date, p_created timestamptz)
returns timestamptz
language sql stable
as $$
  select case
    when p_end is not null then public.departure_at(p_end + 1, '00:00')
    when p_start is not null then public.departure_at(p_start + 8, '00:00')
    else p_created + interval '7 days'
  end
$$;

-- Whether one end of a group is among an alert's picks: its whole city, or
-- the place itself — as search's covers() in lib/rides/search.ts.
create or replace function public.alert_covers(p_picks text[], p_city text, p_place_id uuid)
returns boolean
language sql immutable
as $$
  select p_place_id::text = any (p_picks) or ('city:' || p_city) = any (p_picks)
$$;

-- Whether a departure time is in an alert's time range (inclusive). A range
-- whose start is after its end crosses midnight.
create or replace function public.alert_time_matches(p_from time, p_until time, p_time time)
returns boolean
language sql immutable
as $$
  select case
    when p_from is null and p_until is null then true
    when p_from is null then p_time <= p_until
    when p_until is null then p_time >= p_from
    when p_from <= p_until then p_time between p_from and p_until
    else p_time >= p_from or p_time <= p_until
  end
$$;

-- The dates a route runs inside an alert's window that are still ahead: from
-- its start date (or today) to its end date (or its expiry), leaving out dates
-- the driver cancelled and rides leaving after the alert expires. Seats aren't
-- checked here.
create or replace function public.alert_ride_dates(a public.ride_alerts, r public.routes)
returns setof date
language sql stable
security definer set search_path = ''
as $$
  select d::date
  from generate_series(
    greatest(coalesce(a.start_date, public.israel_today()), public.israel_today()),
    least(coalesce(a.end_date, (a.expires_at at time zone 'Asia/Jerusalem')::date),
          (a.expires_at at time zone 'Asia/Jerusalem')::date),
    interval '1 day'
  ) d
  where public.route_runs_on(r, d::date)
    and public.departure_at(d::date, r.out_time) > now()
    and public.departure_at(d::date, r.out_time) < a.expires_at
    and not exists (select 1 from public.ride_exceptions x
                    where x.route_id = r.id and x.ride_date = d::date and x.cancelled)
  order by 1
$$;

revoke execute on function public.alert_ride_dates from anon, authenticated, public;

-- An alert's places, as the email shows them: "בית שמש (כל העיר)" for a whole
-- city, the place's name otherwise; a place since deleted is left out.
create or replace function public.alert_place_names(p_picks text[])
returns text
language sql stable
security definer set search_path = ''
as $$
  select string_agg(coalesce(
           case when p like 'city:%' then substr(p, 6) || ' (כל העיר)' end,
           (select pl.name from public.places pl where pl.id::text = p)), ' / ' order by p)
  from unnest(p_picks) p
$$;

revoke execute on function public.alert_place_names from anon, authenticated, public;

-- ─── Saving ──────────────────────────────────────────────────────────────────

-- Saves an alert for the signed-in passenger and returns its id. Errors:
-- INVALID_ALERT (bad picks, a past date, a start after the end), ALERT_LIMIT
-- (she already has 3) and ALERT_DUPLICATE (the same places and ranges).
create or replace function public.create_ride_alert(
  p_origins      text[],
  p_destinations text[],
  p_start_date   date default null,
  p_end_date     date default null,
  p_from_time    time default null,
  p_until_time   time default null
)
returns uuid
language plpgsql volatile
security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_origins text[] := coalesce((select array_agg(distinct o order by o) from unnest(p_origins) o where o is not null), '{}');
  v_destinations text[] := coalesce((select array_agg(distinct d order by d) from unnest(p_destinations) d where d is not null), '{}');
  v_pick_pattern constant text := '^(city:.{1,40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$';
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  if cardinality(v_origins) not between 1 and 30 or cardinality(v_destinations) not between 1 and 30
     or exists (select 1 from unnest(v_origins || v_destinations) x where x !~ v_pick_pattern)
     or p_start_date < public.israel_today() or p_end_date < public.israel_today()
     or p_start_date > p_end_date then
    raise exception 'INVALID_ALERT' using errcode = '22023';
  end if;

  -- One save at a time per passenger, so two at once can't pass the limit.
  perform 1 from public.profiles where id = v_user for update;

  delete from public.ride_alerts where passenger_id = v_user and expires_at <= now();

  if (select count(*) from public.ride_alerts where passenger_id = v_user) >= 3 then
    raise exception 'ALERT_LIMIT' using errcode = '23514';
  end if;

  begin
    insert into public.ride_alerts (passenger_id, origins, destinations, start_date, end_date, from_time, until_time, expires_at)
    values (v_user, v_origins, v_destinations, p_start_date, p_end_date, p_from_time, p_until_time,
            public.ride_alert_expiry(p_start_date, p_end_date, now()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ALERT_DUPLICATE' using errcode = '23505';
  end;
  return v_id;
end
$$;

revoke execute on function public.create_ride_alert from anon, public;
grant execute on function public.create_ride_alert to authenticated;

-- ─── Matching ────────────────────────────────────────────────────────────────

-- One row per alert a new route matched. sent_at is when it was claimed for
-- sending; a failed send sets it back to null. Removed with its alert.
create table if not exists public.alert_matches (
  alert_id    uuid not null references public.ride_alerts (id) on delete cascade,
  route_id    uuid not null references public.routes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  primary key (alert_id, route_id)
);

create index if not exists alert_matches_waiting on public.alert_matches (route_id) where sent_at is null;

-- No policies: only the functions here read and write it.
alter table public.alert_matches enable row level security;
revoke all on public.alert_matches from anon, authenticated;

-- A route is published: each alert it matches — same places, a date ahead in
-- the alert's range with a free seat, a departure time in its range, not
-- expired, and not the driver's own — is recorded. Edits don't come here.
create or replace function public.queue_alert_matches()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if not new.is_active then return null; end if;
  insert into public.alert_matches (alert_id, route_id)
  select a.id, new.id
  from public.ride_alerts a
  join public.ride_groups g on g.id = new.group_id and g.is_active
  where a.expires_at > now()
    and a.passenger_id <> new.driver_id
    and public.alert_covers(a.origins, g.origin_city, g.origin_place_id)
    and public.alert_covers(a.destinations, g.destination_city, g.destination_place_id)
    and public.alert_time_matches(a.from_time, a.until_time, new.out_time)
    and exists (
      select 1 from public.alert_ride_dates(a, new) d
      where (select count(*) from public.bookings b
             where b.route_id = new.id and b.ride_date = d and b.status = 'active') < new.seats
    )
  on conflict do nothing;
  return null;
end;
$$;

revoke execute on function public.queue_alert_matches from anon, authenticated, public;

drop trigger if exists routes_queue_alert_matches on public.routes;
create trigger routes_queue_alert_matches
  after insert on public.routes
  for each row execute function public.queue_alert_matches();

-- ─── Sending ─────────────────────────────────────────────────────────────────

-- Claims what is waiting for up to 50 passengers and returns one email per
-- passenger and route: the ride as it is now (dates still ahead in any of the
-- matched alerts' windows, departure time, price, driver's name) and the
-- alerts it matched. Everything claimed is marked as sent, including what is
-- no longer sent: a route removed or whose group was hidden since, one with no
-- date left ahead, and a passenger who turned the ride emails off. Seats
-- aren't checked again. Then deletes expired alerts, with their matches.
create or replace function public.claim_alert_emails()
returns table (
  alert_ids uuid[],
  route_id  uuid,
  to_name   text,
  to_email  text,
  ride      jsonb,
  alerts    jsonb
)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
  with waiting as (
    select a.passenger_id from public.alert_matches m
    join public.ride_alerts a on a.id = m.alert_id
    where m.sent_at is null
    group by a.passenger_id
    order by min(m.created_at)
    limit 50
  ),
  picked as (
    select m.alert_id, m.route_id
    from public.alert_matches m
    where m.sent_at is null
      and m.alert_id in (select a.id from public.ride_alerts a where a.passenger_id in (select w.passenger_id from waiting w))
    for update skip locked
  ),
  marked as (
    update public.alert_matches u set sent_at = now()
    from picked k
    where u.alert_id = k.alert_id and u.route_id = k.route_id
    returning u.alert_id
  ),
  items as (
    select a.*, r.id as r_id,
           array(select public.alert_ride_dates(a, r)) as dates
    from picked k
    join public.ride_alerts a on a.id = k.alert_id
    join public.routes r on r.id = k.route_id and r.is_active
    join public.ride_groups g on g.id = r.group_id and g.is_active
  )
  select array_agg(i.id order by i.created_at, i.id),
         i.r_id,
         p.full_name,
         p.email,
         jsonb_build_object(
           'origin',      g.origin,
           'destination', g.destination,
           'out_time',    to_char(r.out_time, 'HH24:MI'),
           'price',       r.price,
           'driver_name', d.full_name,
           'dates',       (select jsonb_agg(x order by x)
                           from (select distinct unnest(dates) x from items j
                                 where j.passenger_id = i.passenger_id and j.r_id = i.r_id) s)
         ),
         jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id',           i.id,
           'origins',      public.alert_place_names(i.origins),
           'destinations', public.alert_place_names(i.destinations),
           'start_date',   i.start_date,
           'end_date',     i.end_date,
           'from_time',    to_char(i.from_time, 'HH24:MI'),
           'until_time',   to_char(i.until_time, 'HH24:MI')
         )) order by i.created_at, i.id)
  from items i
  join public.routes r on r.id = i.r_id
  join public.ride_groups g on g.id = r.group_id
  join public.profiles d on d.id = r.driver_id
  join public.profiles p on p.id = i.passenger_id
  where cardinality(i.dates) > 0 and p.email <> '' and p.ride_emails_enabled
  group by i.passenger_id, i.r_id, p.full_name, p.email, g.origin, g.destination, r.out_time, r.price, d.full_name;

  delete from public.ride_alerts a where a.expires_at <= now();
end;
$$;

revoke execute on function public.claim_alert_emails from anon, authenticated, public;
grant execute on function public.claim_alert_emails to service_role;
