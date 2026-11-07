-- YourWay — emails about a member's own rides, as they happen.
-- Run after 0042_daily_visits.sql. Safe to run again.
--
-- Until now only the driver's daily email (D7) was sent. Now each change to a
-- booking is queued here by the database, and the Edge Function that sends the
-- daily email (supabase/functions/daily-passenger-email) sends the queue on
-- its 5-minute run (spec A7):
--
-- - booked: a passenger booked a ride — to her, with the driver's phone.
-- - cancelled: she cancelled her booking — to her.
-- - passenger_cancelled: the same cancellation — to the ride's driver.
-- - ride_cancelled: the driver cancelled the date, or removed the route
--   (0018) — to each booked passenger.
--
-- A passenger the driver added has no account, so nothing is sent to her or
-- about her. The emails are on until the member turns them off on her profile
-- (ride_emails_enabled).

alter table public.profiles add column if not exists ride_emails_enabled boolean not null default true;

grant update (ride_emails_enabled) on public.profiles to authenticated;

do $$ begin
  create type public.ride_email_kind as enum ('booked', 'cancelled', 'passenger_cancelled', 'ride_cancelled');
exception when duplicate_object then null; end $$;

-- One row per booking an email is about. sent_at is when it was claimed for
-- sending; a failed send sets it back to null. Who gets it and what it says
-- are decided when it is claimed, so turning the emails off stops those
-- already waiting too.
create table if not exists public.email_outbox (
  id         bigint generated always as identity primary key,
  kind       public.ride_email_kind not null,
  recipient  uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

create index if not exists email_outbox_waiting on public.email_outbox (recipient) where sent_at is null;

-- No policies: only the functions below read and write it.
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- ─── Queuing ─────────────────────────────────────────────────────────────────

-- A passenger books (book_ride), or cancels (cancel_booking).
create or replace function public.queue_booking_emails()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.added_by_driver then return null; end if;
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      insert into public.email_outbox (kind, recipient, booking_id) values ('booked', new.passenger_id, new.id);
    end if;
  elsif old.status = 'active' and new.status = 'cancelled' then
    insert into public.email_outbox (kind, recipient, booking_id)
    select 'cancelled'::public.ride_email_kind, new.passenger_id, new.id
    union all
    select 'passenger_cancelled'::public.ride_email_kind, r.driver_id, new.id from public.routes r where r.id = new.route_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.queue_booking_emails from anon, authenticated, public;

drop trigger if exists bookings_queue_emails on public.bookings;
create trigger bookings_queue_emails
  after insert or update of status on public.bookings
  for each row execute function public.queue_booking_emails();

-- The driver cancels a date, or removing the route cancels its booked dates
-- (cancel_off_schedule_bookings, 0018). A date already cancelled sends nothing again.
create or replace function public.queue_ride_cancelled_emails()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.cancelled and (tg_op = 'INSERT' or not old.cancelled) then
    insert into public.email_outbox (kind, recipient, booking_id)
    select 'ride_cancelled', b.passenger_id, b.id
    from public.bookings b
    where b.route_id = new.route_id and b.ride_date = new.ride_date
      and b.status = 'active' and not b.added_by_driver;
  end if;
  return null;
end;
$$;

revoke execute on function public.queue_ride_cancelled_emails from anon, authenticated, public;

drop trigger if exists ride_exceptions_queue_emails on public.ride_exceptions;
create trigger ride_exceptions_queue_emails
  after insert or update of cancelled on public.ride_exceptions
  for each row execute function public.queue_ride_cancelled_emails();

-- ─── Sending ─────────────────────────────────────────────────────────────────

-- Claims what is waiting for up to 50 members and returns one email per member
-- and kind, listing its rides by date and time: a passenger who booked several
-- dates at once gets one email. Everything claimed is marked as sent,
-- including what is no longer sent: a ride that already left, a member who
-- turned the emails off, and — for a booking — a booking cancelled since, or a
-- date the driver cancelled since. A ride's details are those a booked
-- passenger sees: the driver's phone goes only to a passenger whose booking is
-- active (or whose date the driver cancelled), and the driver gets a
-- passenger's name only. ids are the rows, for releasing a failed send. Rows
-- sent over 30 days ago are deleted.
create or replace function public.claim_ride_emails()
returns table (
  ids      bigint[],
  kind     text,
  to_name  text,
  to_email text,
  rides    jsonb
)
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.email_outbox o where o.sent_at < now() - interval '30 days';

  return query
  with waiting as (
    select o.recipient from public.email_outbox o
    where o.sent_at is null
    group by o.recipient
    order by min(o.id)
    limit 50
  ),
  picked as (
    select o.id, o.kind, o.recipient, o.booking_id
    from public.email_outbox o
    where o.sent_at is null and o.recipient in (select w.recipient from waiting w)
    for update skip locked
  ),
  marked as (
    update public.email_outbox u set sent_at = now()
    from picked k
    where u.id = k.id
    returning u.id
  ),
  items as (
    select k.id, k.kind, k.recipient, b.ride_date, r.out_time,
           jsonb_strip_nulls(jsonb_build_object(
             'ride_date',      b.ride_date,
             'out_time',       to_char(r.out_time, 'HH24:MI'),
             'origin',         g.origin,
             'destination',    g.destination,
             'pickup',         pu.label,
             'dropoff',        dr.label,
             'price',          case when k.kind = 'booked' then b.price end,
             'driver_name',    case when k.kind <> 'passenger_cancelled' then d.full_name end,
             'driver_phone',   case when k.kind in ('booked', 'ride_cancelled') then d.phone end,
             'passenger_name', case when k.kind = 'passenger_cancelled' then pa.full_name end
           )) as ride
    from picked k
    join public.bookings b on b.id = k.booking_id
    join public.routes r on r.id = b.route_id
    join public.ride_groups g on g.id = r.group_id
    join public.stops pu on pu.id = b.pickup_stop_id
    join public.stops dr on dr.id = b.dropoff_stop_id
    join public.profiles d on d.id = r.driver_id
    left join public.profiles pa on pa.id = b.passenger_id
    where public.departure_at(b.ride_date, r.out_time) > now()
      and (k.kind <> 'booked'
           or (b.status = 'active'
               and not exists (select 1 from public.ride_exceptions x
                               where x.route_id = b.route_id and x.ride_date = b.ride_date and x.cancelled)))
  )
  select array_agg(i.id order by i.id), i.kind::text, p.full_name, p.email,
         jsonb_agg(i.ride order by i.ride_date, i.out_time, i.id)
  from items i
  join public.profiles p on p.id = i.recipient
  where p.email <> '' and p.ride_emails_enabled
  group by i.recipient, i.kind, p.full_name, p.email;
end;
$$;

revoke execute on function public.claim_ride_emails from anon, authenticated, public;
grant execute on function public.claim_ride_emails to service_role;
