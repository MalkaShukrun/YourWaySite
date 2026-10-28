-- YourWay — drivers add passengers to their rides by hand, including people
-- who haven't signed up yet. Run after 0011_route_notes.sql. Safe to run again.
--
-- The driver enters a name, a phone and optionally an email. If they belong to
-- a user, the booking is theirs right away; otherwise it's a guest booking
-- (passenger_id null) that moves to the user's account once she signs in with
-- that email or saves that phone on her profile. Phones are compared by their
-- digits only (050-123-4567 = 0501234567).
--
-- Unlike the email (verified by Google), the profile phone is whatever the
-- user typed: someone who enters another person's number gets that person's
-- guest bookings. Accepted so that drivers can add passengers by phone.
--
-- The driver always sees the details she entered, never the matching
-- profile's, so adding a phone or email can't be used to look someone up.

-- ─── Columns ─────────────────────────────────────────────────────────────────

create or replace function public.phone_digits(p_phone text)
returns text
language sql immutable
as $$ select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') $$;

alter table public.bookings
  alter column passenger_id drop not null,
  add column if not exists added_by_driver boolean not null default false,
  add column if not exists guest_name      text,
  add column if not exists guest_email     text,   -- stored lower-case
  add column if not exists guest_phone     text;

-- Limits match lib/validation/passenger.ts.
alter table public.bookings drop constraint if exists bookings_passenger_or_guest;
alter table public.bookings add constraint bookings_passenger_or_guest
  check (passenger_id is not null or (guest_name is not null and guest_phone is not null));
alter table public.bookings drop constraint if exists bookings_guest_lengths;
alter table public.bookings add constraint bookings_guest_lengths
  check (char_length(guest_name) <= 60 and char_length(guest_email) <= 254 and char_length(guest_phone) <= 20);

-- The same guest only once per ride, like registered passengers.
drop index if exists public.bookings_one_active_per_guest;
create unique index if not exists bookings_one_active_per_guest_phone
  on public.bookings (route_id, ride_date, public.phone_digits(guest_phone))
  where status = 'active' and passenger_id is null;
create index if not exists bookings_guest_email_idx
  on public.bookings (guest_email) where passenger_id is null;
create index if not exists bookings_guest_phone_idx
  on public.bookings (public.phone_digits(guest_phone)) where passenger_id is null;

-- ─── Claiming guest bookings ─────────────────────────────────────────────────

-- Moves the guest bookings made for a user's verified email or profile phone
-- to her account. A guest booking for a ride she already booked herself is
-- cancelled instead (one seat per person).
create or replace function public.claim_guest_bookings(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_email text;
  v_phone text;
begin
  select public.phone_digits(p.phone),
         case when u.email_confirmed_at is not null then lower(u.email) end
  into v_phone, v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id;
  if not found then return; end if;

  update public.bookings g set status = 'cancelled', cancelled_at = now()
  where g.passenger_id is null and g.status = 'active'
    and ((coalesce(v_email, '') <> '' and g.guest_email = v_email)
         or (v_phone <> '' and public.phone_digits(g.guest_phone) = v_phone))
    and exists (select 1 from public.bookings b
                where b.route_id = g.route_id and b.ride_date = g.ride_date
                  and b.passenger_id = p_user_id and b.status = 'active');

  update public.bookings g set passenger_id = p_user_id
  where g.passenger_id is null
    and ((coalesce(v_email, '') <> '' and g.guest_email = v_email)
         or (v_phone <> '' and public.phone_digits(g.guest_phone) = v_phone));
end;
$$;

revoke execute on function public.claim_guest_bookings from anon, authenticated, public;

-- Runs when the profile is created or its phone saved (onboarding, profile
-- screen), and when the sign-in email is verified or changes.
create or replace function public.claim_guest_bookings_trigger()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.claim_guest_bookings(new.id);
  return new;
end;
$$;

revoke execute on function public.claim_guest_bookings_trigger from anon, authenticated, public;

drop trigger if exists profiles_claim_guest_bookings on public.profiles;
create trigger profiles_claim_guest_bookings
  after insert or update of phone on public.profiles
  for each row execute function public.claim_guest_bookings_trigger();

drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified
  after update of email, email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.claim_guest_bookings_trigger();

-- ─── Driver functions ────────────────────────────────────────────────────────

-- Add a passenger to the signed-in driver's ride on a date. Same checks as
-- book_ride (0003), except that the departure may already have passed: the
-- driver may record who rode with her, for payment tracking.
drop function if exists public.add_passenger(uuid, date, text, text, text, uuid, uuid);
create function public.add_passenger(
  p_route_id uuid, p_date date, p_name text, p_phone text, p_email text,
  p_pickup_stop_id uuid, p_dropoff_stop_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_name      text := btrim(p_name);
  v_phone     text := public.phone_digits(p_phone);
  v_email     text := nullif(lower(btrim(p_email)), '');
  v_route     public.routes;
  v_passenger uuid;
  v_taken     integer;
  v_id        uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(v_name, '') = '' or v_phone = '' then raise exception 'INVALID_PASSENGER'; end if;

  select * into v_route from public.routes where id = p_route_id for update;
  if not found or v_route.driver_id <> v_uid then raise exception 'ROUTE_NOT_FOUND'; end if;
  if not v_route.is_active or not public.route_runs_on(v_route, p_date)
     or exists (select 1 from public.ride_exceptions
                where route_id = p_route_id and ride_date = p_date and cancelled) then
    raise exception 'RIDE_UNAVAILABLE';
  end if;

  if not exists (select 1 from public.stops where id = p_pickup_stop_id and route_id = p_route_id
                 and kind = 'pickup' and is_active)
     or not exists (select 1 from public.stops where id = p_dropoff_stop_id and route_id = p_route_id
                    and kind = 'dropoff' and is_active) then
    raise exception 'INVALID_STOP';
  end if;

  -- The user with this verified email, or else the only one with this phone.
  select u.id into v_passenger from auth.users u
  join public.profiles p on p.id = u.id
  where v_email is not null and lower(u.email) = v_email and u.email_confirmed_at is not null;
  if v_passenger is null then
    select min(p.id::text)::uuid into v_passenger from public.profiles p
    where public.phone_digits(p.phone) = v_phone
    having count(*) = 1;
  end if;
  if v_passenger = v_uid then raise exception 'OWN_RIDE'; end if;

  if exists (select 1 from public.bookings
             where route_id = p_route_id and ride_date = p_date and status = 'active'
               and (passenger_id = v_passenger
                    or (passenger_id is null and (public.phone_digits(guest_phone) = v_phone
                                                  or guest_email = v_email)))) then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into v_taken from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active';
  if v_taken >= v_route.seats then raise exception 'RIDE_FULL'; end if;

  insert into public.bookings (route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id,
                               added_by_driver, guest_name, guest_phone, guest_email)
  values (p_route_id, p_date, v_passenger, p_pickup_stop_id, p_dropoff_stop_id,
          true, v_name, btrim(p_phone), v_email)
  returning id into v_id;
  return v_id;
end;
$$;

-- Take a passenger the driver added off the ride. Passengers who booked
-- themselves cancel through cancel_booking.
create or replace function public.remove_passenger(p_booking_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.bookings b set status = 'cancelled', cancelled_at = now()
  from public.routes r
  where b.id = p_booking_id and b.added_by_driver and b.status = 'active'
    and r.id = b.route_id and r.driver_id = auth.uid();
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
end;
$$;

-- driver_passengers gains columns, and a function's result type can't be
-- changed in place — drop and recreate it. Guests have no profile (left join),
-- and for passengers the driver added she sees the details she entered.
drop function if exists public.driver_passengers(date);
create function public.driver_passengers(p_date date)
returns table (
  booking_id       uuid,
  route_id         uuid,
  passenger_id     uuid,
  passenger_name   text,
  passenger_phone  text,
  passenger_email  text,
  added_by_driver  boolean,
  pickup_stop_id   uuid,
  pickup_label     text,
  pickup_lat       double precision,
  pickup_lng       double precision,
  pickup_position  smallint,
  dropoff_stop_id  uuid,
  dropoff_label    text,
  dropoff_lat      double precision,
  dropoff_lng      double precision,
  dropoff_position smallint
)
language sql stable
security definer set search_path = ''
as $$
  select b.id, b.route_id, b.passenger_id,
         case when b.added_by_driver then b.guest_name  else p.full_name end,
         case when b.added_by_driver then b.guest_phone else p.phone end,
         case when b.added_by_driver then b.guest_email else p.email end,
         b.added_by_driver,
         ps.id, ps.label, ps.lat, ps.lng, ps.position,
         ds.id, ds.label, ds.lat, ds.lng, ds.position
  from public.bookings b
  join public.routes r on r.id = b.route_id and r.driver_id = auth.uid()
  left join public.profiles p on p.id = b.passenger_id
  join public.stops ps on ps.id = b.pickup_stop_id
  join public.stops ds on ds.id = b.dropoff_stop_id
  where b.ride_date = p_date and b.status = 'active'
  order by b.created_at
$$;

revoke execute on function public.add_passenger(uuid, date, text, text, text, uuid, uuid), public.remove_passenger(uuid), public.driver_passengers(date) from anon, public;
grant execute on function public.add_passenger(uuid, date, text, text, text, uuid, uuid), public.remove_passenger(uuid), public.driver_passengers(date) to authenticated;
