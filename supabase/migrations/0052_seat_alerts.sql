-- YourWay — ride alerts also fire when a seat opens on a full ride.
-- Run after 0051_ride_alerts.sql. Safe to run again.
--
-- A full ride's card in the search offers the alert form (spec C10), filled
-- from the card. The alert is the same kind as before (ride_alerts, 0051), and
-- every alert now has two triggers:
-- - a newly published route that matches it (0051, unchanged);
-- - a seat that opens on a matching ride that was full: a booking on it is
--   cancelled (by the passenger, or by the driver removing a passenger she
--   added) and the ride, full before, has a free seat after.
--
-- The check runs when the transaction commits, so a booking cancelled and
-- replaced in one go (a guest's booking claimed by her account, 0014/0029)
-- opens nothing. Each opening is recorded per alert, route and date
-- (alert_seat_matches) and sent by the same 5-minute run as the other alert
-- emails, one email per passenger, route and date. An alert hears about a
-- given date of a route once: a seat opening again on it sends nothing more.
-- Not told: the driver, a passenger already booked on that date, and the
-- passenger who just cancelled. Before sending, the seat is checked again: a
-- seat taken again since, a date cancelled or past, or a route removed sends
-- nothing.

-- ─── Matching ────────────────────────────────────────────────────────────────

-- One row per alert a seat opening matched. sent_at is when it was claimed for
-- sending; a failed send sets it back to null. Removed with its alert.
create table if not exists public.alert_seat_matches (
  alert_id    uuid not null references public.ride_alerts (id) on delete cascade,
  route_id    uuid not null references public.routes (id) on delete cascade,
  ride_date   date not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  primary key (alert_id, route_id, ride_date)
);

create index if not exists alert_seat_matches_waiting on public.alert_seat_matches (route_id) where sent_at is null;

-- No policies: only the functions here read and write it.
alter table public.alert_seat_matches enable row level security;
revoke all on public.alert_seat_matches from anon, authenticated;

-- A booking stopped being active: if its ride was full before this
-- transaction and has a free seat now, each alert the ride matches — same
-- places, the date in the alert's range, the departure time in its range, not
-- expired, not the driver's or a passenger booked on it or who just cancelled
-- — is recorded. "Before this transaction": bookings made in it (created_at =
-- now()) didn't count yet, and bookings cancelled in it (cancelled_at = now())
-- still did.
create or replace function public.queue_seat_alert_matches()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.routes;
  v_time time;
  v_active integer;
  v_before integer;
begin
  select * into r from public.routes where id = new.route_id and is_active;
  if not found then return null; end if;
  if exists (select 1 from public.ride_exceptions x
             where x.route_id = r.id and x.ride_date = new.ride_date and x.cancelled) then
    return null;
  end if;
  v_time := coalesce((select x.out_time from public.ride_exceptions x
                      where x.route_id = r.id and x.ride_date = new.ride_date), r.out_time);
  if public.departure_at(new.ride_date, v_time) <= now() then return null; end if;

  select count(*) filter (where b.status = 'active'),
         count(*) filter (where b.status = 'active' and b.created_at <> now())
           + count(*) filter (where b.status <> 'active' and b.cancelled_at = now() and b.created_at <> now())
  into v_active, v_before
  from public.bookings b
  where b.route_id = r.id and b.ride_date = new.ride_date;
  if v_before < r.seats or v_active >= r.seats then return null; end if;

  insert into public.alert_seat_matches (alert_id, route_id, ride_date)
  select a.id, r.id, new.ride_date
  from public.ride_alerts a
  join public.ride_groups g on g.id = r.group_id and g.is_active
  where a.expires_at > now()
    and a.passenger_id <> r.driver_id
    and public.alert_covers(a.origins, g.origin_city, g.origin_place_id)
    and public.alert_covers(a.destinations, g.destination_city, g.destination_place_id)
    and public.alert_time_matches(a.from_time, a.until_time, v_time)
    and new.ride_date in (select public.alert_ride_dates(a, r))
    and not exists (select 1 from public.bookings b
                    where b.route_id = r.id and b.ride_date = new.ride_date and b.passenger_id = a.passenger_id
                      and (b.status = 'active' or b.cancelled_at = now()))
  on conflict do nothing;
  return null;
end;
$$;

revoke execute on function public.queue_seat_alert_matches from anon, authenticated, public;

-- Deferred to the commit, so what the transaction books in the cancelled
-- booking's place is counted.
drop trigger if exists bookings_queue_seat_alert_matches on public.bookings;
create constraint trigger bookings_queue_seat_alert_matches
  after update on public.bookings
  deferrable initially deferred
  for each row
  when (old.status = 'active' and new.status <> 'active')
  execute function public.queue_seat_alert_matches();

-- ─── Sending ─────────────────────────────────────────────────────────────────

-- Claims what is waiting for up to 50 passengers and returns one email per
-- passenger, route and date, shaped as claim_alert_emails' (0051) with
-- reason 'seat' and the one date. Everything claimed is marked as sent,
-- including what is no longer sent: the seat taken again, the date cancelled
-- or past, the route removed or its group hidden, the passenger booked on it
-- since, and a passenger who turned the ride emails off.
create or replace function public.claim_seat_alert_emails()
returns table (
  reason    text,
  alert_ids uuid[],
  route_id  uuid,
  ride_date date,
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
    select a.passenger_id from public.alert_seat_matches m
    join public.ride_alerts a on a.id = m.alert_id
    where m.sent_at is null
    group by a.passenger_id
    order by min(m.created_at)
    limit 50
  ),
  picked as (
    select m.alert_id, m.route_id, m.ride_date
    from public.alert_seat_matches m
    where m.sent_at is null
      and m.alert_id in (select a.id from public.ride_alerts a where a.passenger_id in (select w.passenger_id from waiting w))
    for update skip locked
  ),
  marked as (
    update public.alert_seat_matches u set sent_at = now()
    from picked k
    where u.alert_id = k.alert_id and u.route_id = k.route_id and u.ride_date = k.ride_date
    returning u.alert_id
  ),
  items as (
    select a.*, r.id as r_id, k.ride_date as r_date, coalesce(x.out_time, r.out_time) as r_time
    from picked k
    join public.ride_alerts a on a.id = k.alert_id
    join public.routes r on r.id = k.route_id and r.is_active
    join public.ride_groups g on g.id = r.group_id and g.is_active
    left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = k.ride_date
    where coalesce(x.cancelled, false) = false
      and public.departure_at(k.ride_date, coalesce(x.out_time, r.out_time)) > now()
      and (select count(*) from public.bookings b
           where b.route_id = r.id and b.ride_date = k.ride_date and b.status = 'active') < r.seats
      and not exists (select 1 from public.bookings b
                      where b.route_id = r.id and b.ride_date = k.ride_date
                        and b.passenger_id = a.passenger_id and b.status = 'active')
  )
  select 'seat'::text,
         array_agg(i.id order by i.created_at, i.id),
         i.r_id,
         i.r_date,
         p.full_name,
         p.email,
         jsonb_build_object(
           'origin',      g.origin,
           'destination', g.destination,
           'out_time',    to_char(i.r_time, 'HH24:MI'),
           'price',       r.price,
           'driver_name', d.full_name,
           'dates',       jsonb_build_array(i.r_date)
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
  where p.email <> '' and p.ride_emails_enabled
  group by i.passenger_id, i.r_id, i.r_date, i.r_time, p.full_name, p.email, g.origin, g.destination, r.price, d.full_name;
end;
$$;

revoke execute on function public.claim_seat_alert_emails from anon, authenticated, public;
grant execute on function public.claim_seat_alert_emails to service_role;
