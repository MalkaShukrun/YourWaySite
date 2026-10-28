-- YourWay — passengers the driver adds stay apart from user accounts.
-- Run after 0012_driver_added_passengers.sql. Safe to run again.
--
-- 0012 linked such a booking to the account with the same phone or email,
-- and moved it to an account that later saved that phone. A profile phone is
-- whatever the user typed, so anyone could collect another passenger's rides.
-- Now the driver enters a name, a phone and the stops; the booking holds those
-- details only (passenger_id null) and never reaches an account. Only the
-- driver sees it: the bookings policies and functions all match passenger_id.

-- ─── No more claiming ────────────────────────────────────────────────────────

drop trigger if exists profiles_claim_guest_bookings on public.profiles;
drop trigger if exists on_auth_user_verified on auth.users;
drop function if exists public.claim_guest_bookings_trigger();
drop function if exists public.claim_guest_bookings(uuid);

-- Bookings 0012 already linked go back to being the driver's guests.
update public.bookings set passenger_id = null
where added_by_driver and passenger_id is not null;

-- ─── Columns ─────────────────────────────────────────────────────────────────

-- The email was only for linking.
drop index if exists public.bookings_guest_email_idx;
drop index if exists public.bookings_guest_phone_idx;
alter table public.bookings drop constraint if exists bookings_guest_lengths;
alter table public.bookings drop column if exists guest_email;

-- A booking is either the passenger's own or a guest's the driver added.
alter table public.bookings drop constraint if exists bookings_passenger_or_guest;
alter table public.bookings add constraint bookings_passenger_or_guest check (
  (added_by_driver and passenger_id is null and guest_name is not null and guest_phone is not null)
  or (not added_by_driver and passenger_id is not null)
);

-- Limits and formats match lib/validation/passenger.ts and PHONE_PATTERN in
-- lib/validation/patterns.ts.
alter table public.bookings drop constraint if exists bookings_guest_details;
alter table public.bookings add constraint bookings_guest_details check (
  (guest_name is null or (char_length(guest_name) between 2 and 60 and guest_name = btrim(guest_name)
                          and guest_name !~ '[[:cntrl:]]'))
  and (guest_phone is null or guest_phone ~ '^0\d{1,2}-?\d{3}-?\d{4}$')
);

-- ─── Driver functions ────────────────────────────────────────────────────────

-- Add a passenger to the signed-in driver's ride on a date. Same checks as
-- book_ride (0003), except that the departure may already have passed: the
-- driver may record who rode with her, for payment tracking.
drop function if exists public.add_passenger(uuid, date, text, text, text, uuid, uuid);
create or replace function public.add_passenger(
  p_route_id uuid, p_date date, p_name text, p_phone text,
  p_pickup_stop_id uuid, p_dropoff_stop_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := btrim(p_name);
  v_phone  text := btrim(p_phone);
  v_digits text := public.phone_digits(p_phone);
  v_route  public.routes;
  v_taken  integer;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(char_length(v_name), 0) not between 2 and 60 or v_name ~ '[[:cntrl:]]'
     or coalesce(v_phone, '') !~ '^0\d{1,2}-?\d{3}-?\d{4}$' then
    raise exception 'INVALID_PASSENGER';
  end if;

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

  if exists (select 1 from public.profiles where id = v_uid and public.phone_digits(phone) = v_digits) then
    raise exception 'OWN_RIDE';
  end if;

  -- One seat per phone: a guest already added, or a passenger who booked
  -- herself (the driver already sees her phone in driver_passengers).
  if exists (select 1 from public.bookings b
             left join public.profiles p on p.id = b.passenger_id
             where b.route_id = p_route_id and b.ride_date = p_date and b.status = 'active'
               and public.phone_digits(coalesce(b.guest_phone, p.phone)) = v_digits) then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into v_taken from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active';
  if v_taken >= v_route.seats then raise exception 'RIDE_FULL'; end if;

  insert into public.bookings (route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id,
                               added_by_driver, guest_name, guest_phone)
  values (p_route_id, p_date, null, p_pickup_stop_id, p_dropoff_stop_id, true, v_name, v_phone)
  returning id into v_id;
  return v_id;
end;
$$;

-- The guest's email column is gone; guests have no passenger_id, so the
-- driver can't tell whether a phone belongs to a user.
create or replace function public.driver_passengers(p_date date)
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
         case when b.added_by_driver then null          else p.email end,
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

revoke execute on function public.add_passenger(uuid, date, text, text, uuid, uuid), public.driver_passengers(date) from anon, public;
grant execute on function public.add_passenger(uuid, date, text, text, uuid, uuid), public.driver_passengers(date) to authenticated;

-- ─── Access ──────────────────────────────────────────────────────────────────
-- Who reaches a booking (0002 policies, unchanged): her own passenger, or the
-- driver of its route — for a guest, only the driver who added her. Writes go
-- through the functions, plus the passenger's is_paid toggle. RLS already
-- blocks everything else; these revokes also take away Supabase's default
-- table grants, including TRUNCATE, which RLS doesn't cover.
revoke all on public.bookings from anon;
revoke insert, delete, truncate, references, trigger on public.bookings from authenticated;
