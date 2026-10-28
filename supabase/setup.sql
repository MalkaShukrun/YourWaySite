-- YourWay — full database setup. Paste this whole file into Supabase → SQL Editor → Run.
-- Generated from supabase/migrations/0001–0015. Safe to run more than once.


-- ════════ supabase/migrations/0001_profiles.sql ════════
-- YourWay — user profiles (SRS §1 Authentication & Onboarding, §8 Admin)
-- Run this in the Supabase SQL editor (or with `supabase db push`).

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null default '',
  email          text not null default '',
  phone          text,                       -- required to finish onboarding
  vehicle_model  text,                       -- optional, only for drivers
  vehicle_color  text,
  vehicle_seats  smallint check (vehicle_seats between 1 and 8),
  is_admin       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Helper for RLS policies: is the signed-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Row Level Security
alter table public.profiles enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Users who signed up before this table existed have no profile row yet;
-- they may create their own (onboarding does this).
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

-- Users may edit their own details, but never their own admin flag.
revoke insert, update on public.profiles from authenticated;
grant insert (id, full_name, email, phone, vehicle_model, vehicle_color, vehicle_seats)
  on public.profiles to authenticated;
grant update (full_name, email, phone, vehicle_model, vehicle_color, vehicle_seats)
  on public.profiles to authenticated;

-- To make someone an admin, run (as the project owner):
--   update public.profiles set is_admin = true where email = 'someone@example.com';


-- ════════ supabase/migrations/0002_rides.sql ════════
-- YourWay — rides, stops and bookings (SRS §4 Passenger Hub, §5 Driver Hub, §6 Cancellations)
-- Run after 0001_profiles.sql.

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- Ride groups ("Beit Shemesh ← Jerusalem"). Only admins manage them (SRS §8).
create table if not exists public.ride_groups (
  id           uuid primary key default gen_random_uuid(),
  origin       text not null,
  destination  text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (origin, destination)
);

-- A driver's route: recurring on weekdays, or a one-time ride on a single date.
create table if not exists public.routes (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references public.profiles (id) on delete cascade,
  group_id     uuid not null references public.ride_groups (id),
  kind         text not null check (kind in ('recurring', 'one_time')),
  weekdays     smallint[] not null default '{}',   -- 0 = Sunday … 6 = Saturday
  ride_date    date,                               -- one-time rides only
  out_time     time not null,                      -- outbound departure
  return_time  time,                               -- null = flexible return
  seats        smallint not null check (seats between 1 and 8),
  price        numeric(6, 2) not null default 0 check (price >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  check (
    (kind = 'recurring' and cardinality(weekdays) > 0)
    or (kind = 'one_time' and ride_date is not null)
  )
);
create index if not exists routes_group_idx on public.routes (group_id) where is_active;

-- Designated pickup / drop-off pins on a route's map.
create table if not exists public.stops (
  id        uuid primary key default gen_random_uuid(),
  route_id  uuid not null references public.routes (id) on delete cascade,
  kind      text not null check (kind in ('pickup', 'dropoff')),
  label     text not null,
  lat       double precision not null,
  lng       double precision not null,
  position  smallint not null default 0
);
create index if not exists stops_route_idx on public.stops (route_id);

-- Per-date changes a driver makes without touching the recurring schedule
-- ("cancel for this date only", updated departure time).
create table if not exists public.ride_exceptions (
  route_id   uuid not null references public.routes (id) on delete cascade,
  ride_date  date not null,
  cancelled  boolean not null default false,
  out_time   time,
  primary key (route_id, ride_date)
);

-- A passenger's seat on a route for a specific date.
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid not null references public.routes (id) on delete cascade,
  ride_date        date not null,
  passenger_id     uuid not null references public.profiles (id) on delete cascade,
  pickup_stop_id   uuid not null references public.stops (id),
  dropoff_stop_id  uuid not null references public.stops (id),
  status           text not null default 'active'
                   check (status in ('active', 'cancelled', 'late_cancelled')),
  is_paid          boolean not null default false,   -- personal toggle, passenger only
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz
);
create unique index if not exists bookings_one_active_per_passenger
  on public.bookings (route_id, ride_date, passenger_id) where status = 'active';
create index if not exists bookings_ride_idx on public.bookings (route_id, ride_date) where status = 'active';
create index if not exists bookings_passenger_idx on public.bookings (passenger_id, ride_date);

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.israel_today()
returns date
language sql stable
as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;

create or replace function public.departure_at(p_date date, p_time time)
returns timestamptz
language sql stable
as $$ select (p_date + p_time) at time zone 'Asia/Jerusalem' $$;

create or replace function public.route_runs_on(r public.routes, p_date date)
returns boolean
language sql immutable
as $$
  select case r.kind
    when 'recurring' then extract(dow from p_date)::smallint = any (r.weekdays)
    else r.ride_date = p_date
  end
$$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table public.ride_groups     enable row level security;
alter table public.routes          enable row level security;
alter table public.stops           enable row level security;
alter table public.ride_exceptions enable row level security;
alter table public.bookings        enable row level security;

-- Groups: everyone signed in can read; only admins write.
drop policy if exists "Read groups" on public.ride_groups;
create policy "Read groups" on public.ride_groups for select to authenticated using (true);
drop policy if exists "Admins manage groups" on public.ride_groups;
create policy "Admins manage groups" on public.ride_groups for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Routes & stops: everyone signed in can read; drivers manage their own.
drop policy if exists "Read routes" on public.routes;
create policy "Read routes" on public.routes for select to authenticated using (true);
drop policy if exists "Drivers manage own routes" on public.routes;
create policy "Drivers manage own routes" on public.routes for all to authenticated
  using (driver_id = (select auth.uid())) with check (driver_id = (select auth.uid()));

drop policy if exists "Read stops" on public.stops;
create policy "Read stops" on public.stops for select to authenticated using (true);
drop policy if exists "Drivers manage own stops" on public.stops;
create policy "Drivers manage own stops" on public.stops for all to authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())))
  with check (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())));

drop policy if exists "Read exceptions" on public.ride_exceptions;
create policy "Read exceptions" on public.ride_exceptions for select to authenticated using (true);
drop policy if exists "Drivers manage own exceptions" on public.ride_exceptions;
create policy "Drivers manage own exceptions" on public.ride_exceptions for all to authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())))
  with check (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid())));

-- Bookings: a passenger sees her own, a driver sees bookings on her routes.
-- Creating and cancelling go through book_ride() / cancel_booking() only.
drop policy if exists "Read own or driven bookings" on public.bookings;
create policy "Read own or driven bookings" on public.bookings for select to authenticated
  using (
    passenger_id = (select auth.uid())
    or exists (select 1 from public.routes r where r.id = route_id and r.driver_id = (select auth.uid()))
  );
drop policy if exists "Passengers update own bookings" on public.bookings;
create policy "Passengers update own bookings" on public.bookings for update to authenticated
  using (passenger_id = (select auth.uid())) with check (passenger_id = (select auth.uid()));

revoke insert, update, delete on public.bookings from authenticated;
grant update (is_paid) on public.bookings to authenticated;   -- the "Paid / Unpaid" toggle

-- ─── Passenger functions ─────────────────────────────────────────────────────

-- Available rides (SRS §4.1). With no date: the next 7 days.
create or replace function public.search_rides(
  p_group_id  uuid default null,
  p_date      date default null,
  p_kind      text default null,
  p_from_time time default null,
  p_to_time   time default null
)
returns table (
  route_id     uuid,
  ride_date    date,
  kind         text,
  driver_id    uuid,
  driver_name  text,
  origin       text,
  destination  text,
  out_time     time,
  return_time  time,
  seats        smallint,
  seats_left   integer,
  price        numeric
)
language sql stable
security definer set search_path = ''
as $$
  with days as (
    select d::date as ride_date
    from generate_series(
      coalesce(p_date, public.israel_today()),
      coalesce(p_date, public.israel_today() + 6),
      interval '1 day'
    ) d
  )
  select r.id, days.ride_date, r.kind, r.driver_id, p.full_name, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = days.ride_date and b.status = 'active')::integer,
         r.price
  from public.routes r
  join days on public.route_runs_on(r, days.ride_date)
  join public.ride_groups g on g.id = r.group_id and g.is_active
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = days.ride_date
  where auth.uid() is not null
    and r.is_active
    and r.driver_id <> auth.uid()
    and coalesce(x.cancelled, false) = false
    and public.departure_at(days.ride_date, coalesce(x.out_time, r.out_time)) > now()
    and (p_group_id is null or r.group_id = p_group_id)
    and (p_kind is null or r.kind::text = p_kind)   -- ::text: still valid once 0008 makes kind an enum
    and (p_from_time is null or coalesce(x.out_time, r.out_time) >= p_from_time)
    and (p_to_time is null or coalesce(x.out_time, r.out_time) < p_to_time)
  order by days.ride_date, coalesce(x.out_time, r.out_time)
$$;

-- One ride on one date, with the driver's contact details (SRS §4.2, §2).
create or replace function public.get_ride(p_route_id uuid, p_date date)
returns table (
  route_id        uuid,
  ride_date       date,
  kind            text,
  driver_id       uuid,
  driver_name     text,
  driver_phone    text,
  driver_email    text,
  vehicle_model   text,
  vehicle_color   text,
  origin          text,
  destination     text,
  out_time        time,
  return_time     time,
  seats           smallint,
  seats_left      integer,
  price           numeric,
  is_available    boolean,
  my_booking_id   uuid
)
language sql stable
security definer set search_path = ''
as $$
  select r.id, p_date, r.kind, r.driver_id, p.full_name, p.phone, p.email,
         p.vehicle_model, p.vehicle_color, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer,
         r.price,
         r.is_active and public.route_runs_on(r, p_date) and coalesce(x.cancelled, false) = false
           and public.departure_at(p_date, coalesce(x.out_time, r.out_time)) > now(),
         (select b.id from public.bookings b
          where b.route_id = r.id and b.ride_date = p_date
            and b.passenger_id = auth.uid() and b.status = 'active')
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where auth.uid() is not null and r.id = p_route_id
$$;

-- Book a seat. Locks the route row so two passengers can't take the last seat
-- at the same time; a full ride is blocked (no waitlist).
create or replace function public.book_ride(
  p_route_id uuid, p_date date, p_pickup_stop_id uuid, p_dropoff_stop_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_route   public.routes;
  v_exc     public.ride_exceptions;
  v_taken   integer;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select * into v_route from public.routes where id = p_route_id for update;
  if not found or not v_route.is_active or not public.route_runs_on(v_route, p_date) then
    raise exception 'RIDE_UNAVAILABLE';
  end if;
  if v_route.driver_id = v_uid then raise exception 'OWN_RIDE'; end if;

  select * into v_exc from public.ride_exceptions where route_id = p_route_id and ride_date = p_date;
  if coalesce(v_exc.cancelled, false)
     or public.departure_at(p_date, coalesce(v_exc.out_time, v_route.out_time)) <= now() then
    raise exception 'RIDE_UNAVAILABLE';
  end if;

  if not exists (select 1 from public.stops where id = p_pickup_stop_id and route_id = p_route_id and kind = 'pickup')
     or not exists (select 1 from public.stops where id = p_dropoff_stop_id and route_id = p_route_id and kind = 'dropoff') then
    raise exception 'INVALID_STOP';
  end if;

  if exists (select 1 from public.bookings where route_id = p_route_id and ride_date = p_date
             and passenger_id = v_uid and status = 'active') then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into v_taken from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active';
  if v_taken >= v_route.seats then raise exception 'RIDE_FULL'; end if;

  insert into public.bookings (route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id)
  values (p_route_id, p_date, v_uid, p_pickup_stop_id, p_dropoff_stop_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Cancel a booking (SRS §6.2). Up to 2 hours before departure it's free and the
-- seat simply frees up; later it's a "late" cancellation that stays in the
-- payment journal. Returns 'cancelled' or 'late_cancelled'.
create or replace function public.cancel_booking(p_booking_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booking  public.bookings;
  v_depart   timestamptz;
  v_status   text;
begin
  select * into v_booking from public.bookings
  where id = p_booking_id and passenger_id = auth.uid() and status = 'active'
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select public.departure_at(v_booking.ride_date, coalesce(x.out_time, r.out_time)) into v_depart
  from public.routes r
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = v_booking.ride_date
  where r.id = v_booking.route_id;

  if v_depart <= now() then raise exception 'RIDE_DEPARTED'; end if;

  v_status := case when v_depart - now() >= interval '2 hours' then 'cancelled' else 'late_cancelled' end;
  update public.bookings set status = v_status, cancelled_at = now() where id = p_booking_id;
  return v_status;
end;
$$;

-- All of the signed-in passenger's bookings with ride and driver details
-- (My Rides, history and payment tracking).
create or replace function public.my_bookings()
returns table (
  booking_id      uuid,
  route_id        uuid,
  ride_date       date,
  status          text,
  is_paid         boolean,
  ride_cancelled  boolean,
  kind            text,
  origin          text,
  destination     text,
  out_time        time,
  departure_at    timestamptz,
  price           numeric,
  pickup_label    text,
  dropoff_label   text,
  driver_id       uuid,
  driver_name     text,
  driver_phone    text,
  driver_email    text
)
language sql stable
security definer set search_path = ''
as $$
  select b.id, b.route_id, b.ride_date, b.status, b.is_paid, coalesce(x.cancelled, false),
         r.kind, g.origin, g.destination,
         coalesce(x.out_time, r.out_time),
         public.departure_at(b.ride_date, coalesce(x.out_time, r.out_time)),
         r.price, ps.label, ds.label,
         r.driver_id, p.full_name, p.phone, p.email
  from public.bookings b
  join public.routes r on r.id = b.route_id
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  join public.stops ps on ps.id = b.pickup_stop_id
  join public.stops ds on ds.id = b.dropoff_stop_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = b.ride_date
  where b.passenger_id = auth.uid()
  order by b.ride_date, coalesce(x.out_time, r.out_time)
$$;

revoke execute on function public.search_rides, public.get_ride, public.book_ride,
  public.cancel_booking, public.my_bookings from anon, public;
grant execute on function public.search_rides, public.get_ride, public.book_ride,
  public.cancel_booking, public.my_bookings to authenticated;

-- ─── Starter groups ──────────────────────────────────────────────────────────

insert into public.ride_groups (origin, destination) values
  ('גבעת שאול', 'בית שמש רמה א'),
  ('גבעת שאול', 'בית שמש רמה ג'),
  ('גבעת שאול', 'בית שמש רמה ד'),
  ('הר חוצבים', 'בית שמש רמה א'),
  ('הר חוצבים', 'בית שמש רמה ג'),
  ('הר חוצבים', 'בית שמש רמה ד'),
  ('בית שמש רמה א', 'גבעת שאול'),
  ('בית שמש רמה ג', 'גבעת שאול'),
  ('בית שמש רמה ד', 'גבעת שאול'),
  ('בית שמש רמה א', 'הר חוצבים'),
  ('בית שמש רמה ג', 'הר חוצבים'),
  ('בית שמש רמה ד', 'הר חוצבים')
on conflict (origin, destination) do nothing;


-- ════════ supabase/migrations/0003_driver.sql ════════
-- YourWay — Driver Hub (SRS §5, §6.1). Run after 0002_rides.sql.

-- Stops that bookings still point at can't be deleted, so removing them from a
-- route archives them instead.
alter table public.stops add column if not exists is_active boolean not null default true;

-- Booking only accepts active stops.
create or replace function public.book_ride(
  p_route_id uuid, p_date date, p_pickup_stop_id uuid, p_dropoff_stop_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_route   public.routes;
  v_exc     public.ride_exceptions;
  v_taken   integer;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select * into v_route from public.routes where id = p_route_id for update;
  if not found or not v_route.is_active or not public.route_runs_on(v_route, p_date) then
    raise exception 'RIDE_UNAVAILABLE';
  end if;
  if v_route.driver_id = v_uid then raise exception 'OWN_RIDE'; end if;

  select * into v_exc from public.ride_exceptions where route_id = p_route_id and ride_date = p_date;
  if coalesce(v_exc.cancelled, false)
     or public.departure_at(p_date, coalesce(v_exc.out_time, v_route.out_time)) <= now() then
    raise exception 'RIDE_UNAVAILABLE';
  end if;

  if not exists (select 1 from public.stops where id = p_pickup_stop_id and route_id = p_route_id
                 and kind = 'pickup' and is_active)
     or not exists (select 1 from public.stops where id = p_dropoff_stop_id and route_id = p_route_id
                    and kind = 'dropoff' and is_active) then
    raise exception 'INVALID_STOP';
  end if;

  if exists (select 1 from public.bookings where route_id = p_route_id and ride_date = p_date
             and passenger_id = v_uid and status = 'active') then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into v_taken from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active';
  if v_taken >= v_route.seats then raise exception 'RIDE_FULL'; end if;

  insert into public.bookings (route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id)
  values (p_route_id, p_date, v_uid, p_pickup_stop_id, p_dropoff_stop_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- The signed-in driver's rides on a date (daily dashboard, SRS §5.2).
create or replace function public.driver_rides(p_date date)
returns table (
  route_id           uuid,
  kind               text,
  origin             text,
  destination        text,
  out_time           time,
  scheduled_out_time time,
  return_time        time,
  seats              smallint,
  price              numeric,
  cancelled          boolean,
  booked             integer
)
language sql stable
security definer set search_path = ''
as $$
  select r.id, r.kind, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.out_time, r.return_time, r.seats, r.price,
         coalesce(x.cancelled, false),
         (select count(*) from public.bookings b
          where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where r.driver_id = auth.uid() and r.is_active and public.route_runs_on(r, p_date)
  order by coalesce(x.out_time, r.out_time)
$$;

-- Passengers booked on the signed-in driver's rides on a date, with their
-- contact details and stops (SRS §2, §5.2).
create or replace function public.driver_passengers(p_date date)
returns table (
  booking_id       uuid,
  route_id         uuid,
  passenger_id     uuid,
  passenger_name   text,
  passenger_phone  text,
  passenger_email  text,
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
  select b.id, b.route_id, p.id, p.full_name, p.phone, p.email,
         ps.id, ps.label, ps.lat, ps.lng, ps.position,
         ds.id, ds.label, ds.lat, ds.lng, ds.position
  from public.bookings b
  join public.routes r on r.id = b.route_id and r.driver_id = auth.uid()
  join public.profiles p on p.id = b.passenger_id
  join public.stops ps on ps.id = b.pickup_stop_id
  join public.stops ds on ds.id = b.dropoff_stop_id
  where b.ride_date = p_date and b.status = 'active'
  order by b.created_at
$$;

-- Create or update a route and its stops in one transaction (SRS §5.1).
-- Runs as the caller, so RLS limits it to the driver's own routes.
create or replace function public.save_route(p_route_id uuid, p_route jsonb, p_stops jsonb)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_id        uuid;
  v_weekdays  smallint[];
  v_stop      jsonb;
  v_stop_id   uuid;
  v_keep      uuid[] := '{}';
  v_pickups   smallint := 0;
  v_dropoffs  smallint := 0;
  v_position  smallint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select coalesce(array_agg(d::smallint order by d::smallint), '{}')
  into v_weekdays
  from jsonb_array_elements_text(coalesce(p_route -> 'weekdays', '[]')) d;

  if p_route_id is null then
    insert into public.routes (driver_id, group_id, kind, weekdays, ride_date, out_time, return_time, seats, price)
    values (
      auth.uid(),
      (p_route ->> 'group_id')::uuid,
      p_route ->> 'kind',
      case when p_route ->> 'kind' = 'recurring' then v_weekdays else '{}' end,
      case when p_route ->> 'kind' = 'one_time' then (p_route ->> 'ride_date')::date end,
      (p_route ->> 'out_time')::time,
      nullif(p_route ->> 'return_time', '')::time,
      (p_route ->> 'seats')::smallint,
      (p_route ->> 'price')::numeric
    )
    returning id into v_id;
  else
    update public.routes set
      group_id    = (p_route ->> 'group_id')::uuid,
      kind        = p_route ->> 'kind',
      weekdays    = case when p_route ->> 'kind' = 'recurring' then v_weekdays else '{}' end,
      ride_date   = case when p_route ->> 'kind' = 'one_time' then (p_route ->> 'ride_date')::date end,
      out_time    = (p_route ->> 'out_time')::time,
      return_time = nullif(p_route ->> 'return_time', '')::time,
      seats       = (p_route ->> 'seats')::smallint,
      price       = (p_route ->> 'price')::numeric
    where id = p_route_id and driver_id = auth.uid() and is_active
    returning id into v_id;
    if v_id is null then raise exception 'ROUTE_NOT_FOUND'; end if;
  end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    if v_stop ->> 'kind' = 'pickup' then
      v_pickups := v_pickups + 1; v_position := v_pickups;
    else
      v_dropoffs := v_dropoffs + 1; v_position := v_dropoffs;
    end if;

    v_stop_id := nullif(v_stop ->> 'id', '')::uuid;
    if v_stop_id is not null then
      update public.stops set
        kind = v_stop ->> 'kind', label = v_stop ->> 'label',
        lat = (v_stop ->> 'lat')::double precision, lng = (v_stop ->> 'lng')::double precision,
        position = v_position, is_active = true
      where id = v_stop_id and route_id = v_id
      returning id into v_stop_id;
    end if;
    if v_stop_id is null then
      insert into public.stops (route_id, kind, label, lat, lng, position)
      values (v_id, v_stop ->> 'kind', v_stop ->> 'label',
              (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision, v_position)
      returning id into v_stop_id;
    end if;
    v_keep := v_keep || v_stop_id;
  end loop;

  if v_pickups = 0 or v_dropoffs = 0 then raise exception 'STOPS_REQUIRED'; end if;

  -- Stops removed from the route: archive the ones bookings point at, delete the rest.
  update public.stops s set is_active = false
  where s.route_id = v_id and s.is_active and not (s.id = any (v_keep))
    and exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);
  delete from public.stops s
  where s.route_id = v_id and not (s.id = any (v_keep))
    and not exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);

  return v_id;
end;
$$;

revoke execute on function public.driver_rides, public.driver_passengers, public.save_route from anon, public;
grant execute on function public.driver_rides, public.driver_passengers, public.save_route to authenticated;


-- ════════ supabase/migrations/0004_profile.sql ════════
-- YourWay — profile screen (SRS §1.3) and the owner's admin account (SRS §8).
-- Run after 0003_driver.sql. Safe to run again.

-- Driver's account for receiving payment (shown to passengers who booked her).
alter table public.profiles
  add column if not exists bank_account_name text,
  add column if not exists bank_name         text,
  add column if not exists bank_branch       text,
  add column if not exists bank_account      text;

grant update (bank_account_name, bank_name, bank_branch, bank_account) on public.profiles to authenticated;

-- Payment details of the drivers the signed-in passenger has booked with
-- (payments screen, SRS §4.3). Other users' bank details stay private.
create or replace function public.my_drivers_bank()
returns table (
  driver_id          uuid,
  bank_account_name  text,
  bank_name          text,
  bank_branch        text,
  bank_account       text
)
language sql stable
security definer set search_path = ''
as $$
  select p.id, p.bank_account_name, p.bank_name, p.bank_branch, p.bank_account
  from public.profiles p
  where p.bank_account is not null
    and exists (
      select 1 from public.bookings b
      join public.routes r on r.id = b.route_id
      where b.passenger_id = auth.uid() and r.driver_id = p.id
    )
$$;

revoke execute on function public.my_drivers_bank from anon, public;
grant execute on function public.my_drivers_bank to authenticated;

-- The system owner is an admin (she must have signed in once before). Matched
-- on her sign-in email: the profile email used to be editable (see 0006).
update public.profiles p set is_admin = true
from auth.users u
where u.id = p.id and u.email = 'malkycohen1@gmail.com';


-- ════════ supabase/migrations/0005_optional_stop_location.sql ════════
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


-- ════════ supabase/migrations/0006_profile_email.sql ════════
-- YourWay — the profile email is the verified sign-in email, never user input.
-- Run after 0005_optional_stop_location.sql. Safe to run again.
--
-- Before this, users could write their own profile email, so anyone could show
-- someone else's address to the people they ride with — or set the owner's
-- address and be made admin the next time 0004 ran.

-- The email always comes from the user's Google sign-in (auth.users).
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.email := coalesce((select u.email from auth.users u where u.id = new.id), '');
  return new;
end;
$$;

drop trigger if exists profiles_sync_email on public.profiles;
create trigger profiles_sync_email
  before insert or update on public.profiles
  for each row execute function public.sync_profile_email();

-- Users may no longer write the email column (revoking the table privilege
-- also revokes the column grants, so the rest are granted again).
revoke insert, update on public.profiles from authenticated;
grant insert (id, full_name, phone, vehicle_model, vehicle_color, vehicle_seats)
  on public.profiles to authenticated;
grant update (full_name, phone, vehicle_model, vehicle_color, vehicle_seats,
              bank_account_name, bank_name, bank_branch, bank_account)
  on public.profiles to authenticated;

-- Correct any email that was changed before this migration.
update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- The system owner is an admin — matched on her sign-in email, not the profile.
update public.profiles p set is_admin = true
from auth.users u
where u.id = p.id and u.email = 'malkycohen1@gmail.com';

-- Check who is admin; every row should be someone you made admin:
--   select p.id, u.email, p.full_name from public.profiles p
--   join auth.users u on u.id = p.id where p.is_admin;


-- ════════ supabase/migrations/0007_privacy_fixes.sql ════════
-- YourWay — tighter access to contact details, bank details and routes.
-- Run after 0006_profile_email.sql. Safe to run again.

-- 1. A driver's phone and email go only to passengers booked on that ride
--    (privacy policy §4). Everyone else still sees her name and vehicle.
create or replace function public.get_ride(p_route_id uuid, p_date date)
returns table (
  route_id        uuid,
  ride_date       date,
  kind            text,
  driver_id       uuid,
  driver_name     text,
  driver_phone    text,
  driver_email    text,
  vehicle_model   text,
  vehicle_color   text,
  origin          text,
  destination     text,
  out_time        time,
  return_time     time,
  seats           smallint,
  seats_left      integer,
  price           numeric,
  is_available    boolean,
  my_booking_id   uuid
)
language sql stable
security definer set search_path = ''
as $$
  with mine as (
    select b.id from public.bookings b
    where b.route_id = p_route_id and b.ride_date = p_date
      and b.passenger_id = auth.uid() and b.status = 'active'
  )
  select r.id, p_date, r.kind, r.driver_id, p.full_name,
         case when exists (select 1 from mine) then p.phone end,
         case when exists (select 1 from mine) then p.email end,
         p.vehicle_model, p.vehicle_color, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer,
         r.price,
         r.is_active and public.route_runs_on(r, p_date) and coalesce(x.cancelled, false) = false
           and public.departure_at(p_date, coalesce(x.out_time, r.out_time)) > now(),
         (select id from mine)
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where auth.uid() is not null and r.id = p_route_id
$$;

-- 2. Drivers create and edit their own routes but can't delete them: deleting
--    would also delete passengers' bookings and payment history. Routes are
--    archived instead (is_active = false).
drop policy if exists "Drivers manage own routes" on public.routes;
drop policy if exists "Drivers add own routes" on public.routes;
create policy "Drivers add own routes" on public.routes for insert to authenticated
  with check (driver_id = (select auth.uid()));
drop policy if exists "Drivers edit own routes" on public.routes;
create policy "Drivers edit own routes" on public.routes for update to authenticated
  using (driver_id = (select auth.uid())) with check (driver_id = (select auth.uid()));
revoke delete on public.routes from authenticated, anon;

-- 3. Bank details only for rides the passenger pays for: active bookings and
--    late cancellations — not a booking cancelled in time.
create or replace function public.my_drivers_bank()
returns table (
  driver_id          uuid,
  bank_account_name  text,
  bank_name          text,
  bank_branch        text,
  bank_account       text
)
language sql stable
security definer set search_path = ''
as $$
  select p.id, p.bank_account_name, p.bank_name, p.bank_branch, p.bank_account
  from public.profiles p
  where p.bank_account is not null
    and exists (
      select 1 from public.bookings b
      join public.routes r on r.id = b.route_id
      where b.passenger_id = auth.uid() and r.driver_id = p.id
        and b.status in ('active', 'late_cancelled')
    )
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.get_ride, public.my_drivers_bank from anon, public;
grant execute on function public.get_ride, public.my_drivers_bank to authenticated;


-- ════════ supabase/migrations/0008_enum_types.sql ════════
-- YourWay — enum types for route kinds, stop kinds and booking statuses.
-- Run after 0007_privacy_fixes.sql. Safe to run again.
--
-- These columns were text with a CHECK constraint. As enums, the allowed values
-- live in one named type, and a mistyped value in a function (status = 'actve')
-- raises an error instead of quietly matching nothing. Functions still return
-- these columns as text, so the API the app sees doesn't change.

do $$ begin
  create type public.route_kind as enum ('recurring', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stop_kind as enum ('pickup', 'dropoff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('active', 'cancelled', 'late_cancelled');
exception when duplicate_object then null; end $$;

-- ─── Columns ─────────────────────────────────────────────────────────────────
-- Constraints and partial indexes that compare these columns to text are
-- dropped first and recreated against the enum.

alter table public.routes drop constraint if exists routes_kind_check;
alter table public.routes drop constraint if exists routes_check;
alter table public.routes alter column kind type public.route_kind using kind::public.route_kind;
alter table public.routes add constraint routes_check check (
  (kind = 'recurring' and cardinality(weekdays) > 0)
  or (kind = 'one_time' and ride_date is not null)
);

alter table public.stops drop constraint if exists stops_kind_check;
alter table public.stops alter column kind type public.stop_kind using kind::public.stop_kind;

drop index if exists public.bookings_one_active_per_passenger;
drop index if exists public.bookings_ride_idx;
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings alter column status drop default;
alter table public.bookings alter column status type public.booking_status using status::public.booking_status;
alter table public.bookings alter column status set default 'active';
create unique index if not exists bookings_one_active_per_passenger
  on public.bookings (route_id, ride_date, passenger_id) where status = 'active';
create index if not exists bookings_ride_idx on public.bookings (route_id, ride_date) where status = 'active';

-- ─── Functions that compared or assigned these columns as text ───────────────

-- book_ride itself is unchanged, but it holds a public.routes row variable:
-- connections that already ran it keep a plan with kind as text and fail
-- ("attribute 4 has wrong type"). Altering the function makes them recompile it.
alter function public.book_ride(uuid, date, uuid, uuid) security definer;

-- An unknown p_kind is now an error rather than an empty result.
create or replace function public.search_rides(
  p_group_id  uuid default null,
  p_date      date default null,
  p_kind      text default null,
  p_from_time time default null,
  p_to_time   time default null
)
returns table (
  route_id     uuid,
  ride_date    date,
  kind         text,
  driver_id    uuid,
  driver_name  text,
  origin       text,
  destination  text,
  out_time     time,
  return_time  time,
  seats        smallint,
  seats_left   integer,
  price        numeric
)
language sql stable
security definer set search_path = ''
as $$
  with days as (
    select d::date as ride_date
    from generate_series(
      coalesce(p_date, public.israel_today()),
      coalesce(p_date, public.israel_today() + 6),
      interval '1 day'
    ) d
  )
  select r.id, days.ride_date, r.kind, r.driver_id, p.full_name, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = days.ride_date and b.status = 'active')::integer,
         r.price
  from public.routes r
  join days on public.route_runs_on(r, days.ride_date)
  join public.ride_groups g on g.id = r.group_id and g.is_active
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = days.ride_date
  where auth.uid() is not null
    and r.is_active
    and r.driver_id <> auth.uid()
    and coalesce(x.cancelled, false) = false
    and public.departure_at(days.ride_date, coalesce(x.out_time, r.out_time)) > now()
    and (p_group_id is null or r.group_id = p_group_id)
    and (p_kind is null or r.kind = p_kind::public.route_kind)
    and (p_from_time is null or coalesce(x.out_time, r.out_time) >= p_from_time)
    and (p_to_time is null or coalesce(x.out_time, r.out_time) < p_to_time)
  order by days.ride_date, coalesce(x.out_time, r.out_time)
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booking  public.bookings;
  v_depart   timestamptz;
  v_status   public.booking_status;
begin
  select * into v_booking from public.bookings
  where id = p_booking_id and passenger_id = auth.uid() and status = 'active'
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select public.departure_at(v_booking.ride_date, coalesce(x.out_time, r.out_time)) into v_depart
  from public.routes r
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = v_booking.ride_date
  where r.id = v_booking.route_id;

  if v_depart <= now() then raise exception 'RIDE_DEPARTED'; end if;

  v_status := case when v_depart - now() >= interval '2 hours' then 'cancelled' else 'late_cancelled' end;
  update public.bookings set status = v_status, cancelled_at = now() where id = p_booking_id;
  return v_status;
end;
$$;

-- Same as in 0003, with the JSON strings cast to the enums.
create or replace function public.save_route(p_route_id uuid, p_route jsonb, p_stops jsonb)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_id        uuid;
  v_kind      public.route_kind := (p_route ->> 'kind')::public.route_kind;
  v_weekdays  smallint[];
  v_stop      jsonb;
  v_stop_kind public.stop_kind;
  v_stop_id   uuid;
  v_keep      uuid[] := '{}';
  v_pickups   smallint := 0;
  v_dropoffs  smallint := 0;
  v_position  smallint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select coalesce(array_agg(d::smallint order by d::smallint), '{}')
  into v_weekdays
  from jsonb_array_elements_text(coalesce(p_route -> 'weekdays', '[]')) d;

  if p_route_id is null then
    insert into public.routes (driver_id, group_id, kind, weekdays, ride_date, out_time, return_time, seats, price)
    values (
      auth.uid(),
      (p_route ->> 'group_id')::uuid,
      v_kind,
      case when v_kind = 'recurring' then v_weekdays else '{}' end,
      case when v_kind = 'one_time' then (p_route ->> 'ride_date')::date end,
      (p_route ->> 'out_time')::time,
      nullif(p_route ->> 'return_time', '')::time,
      (p_route ->> 'seats')::smallint,
      (p_route ->> 'price')::numeric
    )
    returning id into v_id;
  else
    update public.routes set
      group_id    = (p_route ->> 'group_id')::uuid,
      kind        = v_kind,
      weekdays    = case when v_kind = 'recurring' then v_weekdays else '{}' end,
      ride_date   = case when v_kind = 'one_time' then (p_route ->> 'ride_date')::date end,
      out_time    = (p_route ->> 'out_time')::time,
      return_time = nullif(p_route ->> 'return_time', '')::time,
      seats       = (p_route ->> 'seats')::smallint,
      price       = (p_route ->> 'price')::numeric
    where id = p_route_id and driver_id = auth.uid() and is_active
    returning id into v_id;
    if v_id is null then raise exception 'ROUTE_NOT_FOUND'; end if;
  end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    v_stop_kind := (v_stop ->> 'kind')::public.stop_kind;
    if v_stop_kind = 'pickup' then
      v_pickups := v_pickups + 1; v_position := v_pickups;
    else
      v_dropoffs := v_dropoffs + 1; v_position := v_dropoffs;
    end if;

    v_stop_id := nullif(v_stop ->> 'id', '')::uuid;
    if v_stop_id is not null then
      update public.stops set
        kind = v_stop_kind, label = v_stop ->> 'label',
        lat = (v_stop ->> 'lat')::double precision, lng = (v_stop ->> 'lng')::double precision,
        position = v_position, is_active = true
      where id = v_stop_id and route_id = v_id
      returning id into v_stop_id;
    end if;
    if v_stop_id is null then
      insert into public.stops (route_id, kind, label, lat, lng, position)
      values (v_id, v_stop_kind, v_stop ->> 'label',
              (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision, v_position)
      returning id into v_stop_id;
    end if;
    v_keep := v_keep || v_stop_id;
  end loop;

  if v_pickups = 0 or v_dropoffs = 0 then raise exception 'STOPS_REQUIRED'; end if;

  -- Stops removed from the route: archive the ones bookings point at, delete the rest.
  update public.stops s set is_active = false
  where s.route_id = v_id and s.is_active and not (s.id = any (v_keep))
    and exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);
  delete from public.stops s
  where s.route_id = v_id and not (s.id = any (v_keep))
    and not exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);

  return v_id;
end;
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.search_rides, public.cancel_booking, public.save_route from anon, public;
grant execute on function public.search_rides, public.cancel_booking, public.save_route to authenticated;


-- ════════ supabase/migrations/0008_remove_bank_details.sql ════════
-- YourWay — drivers' bank details are no longer collected or shown.
-- Run after 0007_privacy_fixes.sql, once the app without bank details is
-- deployed (the old app reads these columns). Safe to run again.
--
-- Deletes every saved bank detail. This can't be undone.

drop function if exists public.my_drivers_bank();

-- Dropping the columns also drops their column grants.
alter table public.profiles
  drop column if exists bank_account_name,
  drop column if exists bank_name,
  drop column if exists bank_branch,
  drop column if exists bank_account;



-- ════════ supabase/migrations/0009_contact_privacy.sql ════════
-- YourWay — a driver's phone and email only for passengers still on the ride.
-- Run after 0008_remove_bank_details.sql. Safe to run again.
--
-- my_bookings returned the driver's contact details for every booking the
-- passenger ever made, including ones cancelled in time. Now, like get_ride
-- (0007), they go only with active bookings and late cancellations (the
-- passenger still pays the driver for those). Passengers' own phones already
-- reach only the driver of the ride they booked (driver_passengers, 0003).

create or replace function public.my_bookings()
returns table (
  booking_id      uuid,
  route_id        uuid,
  ride_date       date,
  status          text,
  is_paid         boolean,
  ride_cancelled  boolean,
  kind            text,
  origin          text,
  destination     text,
  out_time        time,
  departure_at    timestamptz,
  price           numeric,
  pickup_label    text,
  dropoff_label   text,
  driver_id       uuid,
  driver_name     text,
  driver_phone    text,
  driver_email    text
)
language sql stable
security definer set search_path = ''
as $$
  select b.id, b.route_id, b.ride_date, b.status, b.is_paid, coalesce(x.cancelled, false),
         r.kind, g.origin, g.destination,
         coalesce(x.out_time, r.out_time),
         public.departure_at(b.ride_date, coalesce(x.out_time, r.out_time)),
         r.price, ps.label, ds.label,
         r.driver_id, p.full_name,
         case when b.status in ('active', 'late_cancelled') then p.phone end,
         case when b.status in ('active', 'late_cancelled') then p.email end
  from public.bookings b
  join public.routes r on r.id = b.route_id
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  join public.stops ps on ps.id = b.pickup_stop_id
  join public.stops ds on ds.id = b.dropoff_stop_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = b.ride_date
  where b.passenger_id = auth.uid()
  order by b.ride_date, coalesce(x.out_time, r.out_time)
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.my_bookings from anon, public;
grant execute on function public.my_bookings to authenticated;


-- ════════ supabase/migrations/0010_recurring_start_date.sql ════════
-- YourWay — a start date for recurring rides.
-- Run after 0009_contact_privacy.sql. Safe to run again.
--
-- routes.ride_date was set for one-time rides only. Recurring rides now use it
-- too, as the first date they run; null (routes saved before this) means they
-- run from the start.

comment on column public.routes.ride_date is
  'one_time: the ride''s date. recurring: the first date it runs (null = no start date).';

create or replace function public.route_runs_on(r public.routes, p_date date)
returns boolean
language sql immutable
as $$
  select case r.kind
    when 'recurring' then extract(dow from p_date)::smallint = any (r.weekdays)
                          and (r.ride_date is null or p_date >= r.ride_date)
    else r.ride_date = p_date
  end
$$;

create or replace function public.save_route(p_route_id uuid, p_route jsonb, p_stops jsonb)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_id        uuid;
  v_kind      public.route_kind := (p_route ->> 'kind')::public.route_kind;
  v_weekdays  smallint[];
  v_stop      jsonb;
  v_stop_kind public.stop_kind;
  v_stop_id   uuid;
  v_keep      uuid[] := '{}';
  v_pickups   smallint := 0;
  v_dropoffs  smallint := 0;
  v_position  smallint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select coalesce(array_agg(d::smallint order by d::smallint), '{}')
  into v_weekdays
  from jsonb_array_elements_text(coalesce(p_route -> 'weekdays', '[]')) d;

  if p_route_id is null then
    insert into public.routes (driver_id, group_id, kind, weekdays, ride_date, out_time, return_time, seats, price)
    values (
      auth.uid(),
      (p_route ->> 'group_id')::uuid,
      v_kind,
      case when v_kind = 'recurring' then v_weekdays else '{}' end,
      nullif(p_route ->> 'ride_date', '')::date,
      (p_route ->> 'out_time')::time,
      nullif(p_route ->> 'return_time', '')::time,
      (p_route ->> 'seats')::smallint,
      (p_route ->> 'price')::numeric
    )
    returning id into v_id;
  else
    update public.routes set
      group_id    = (p_route ->> 'group_id')::uuid,
      kind        = v_kind,
      weekdays    = case when v_kind = 'recurring' then v_weekdays else '{}' end,
      ride_date   = nullif(p_route ->> 'ride_date', '')::date,
      out_time    = (p_route ->> 'out_time')::time,
      return_time = nullif(p_route ->> 'return_time', '')::time,
      seats       = (p_route ->> 'seats')::smallint,
      price       = (p_route ->> 'price')::numeric
    where id = p_route_id and driver_id = auth.uid() and is_active
    returning id into v_id;
    if v_id is null then raise exception 'ROUTE_NOT_FOUND'; end if;
  end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    v_stop_kind := (v_stop ->> 'kind')::public.stop_kind;
    if v_stop_kind = 'pickup' then
      v_pickups := v_pickups + 1; v_position := v_pickups;
    else
      v_dropoffs := v_dropoffs + 1; v_position := v_dropoffs;
    end if;

    v_stop_id := nullif(v_stop ->> 'id', '')::uuid;
    if v_stop_id is not null then
      update public.stops set
        kind = v_stop_kind, label = v_stop ->> 'label',
        lat = (v_stop ->> 'lat')::double precision, lng = (v_stop ->> 'lng')::double precision,
        position = v_position, is_active = true
      where id = v_stop_id and route_id = v_id
      returning id into v_stop_id;
    end if;
    if v_stop_id is null then
      insert into public.stops (route_id, kind, label, lat, lng, position)
      values (v_id, v_stop_kind, v_stop ->> 'label',
              (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision, v_position)
      returning id into v_stop_id;
    end if;
    v_keep := v_keep || v_stop_id;
  end loop;

  if v_pickups = 0 or v_dropoffs = 0 then raise exception 'STOPS_REQUIRED'; end if;

  -- Stops removed from the route: archive the ones bookings point at, delete the rest.
  update public.stops s set is_active = false
  where s.route_id = v_id and s.is_active and not (s.id = any (v_keep))
    and exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);
  delete from public.stops s
  where s.route_id = v_id and not (s.id = any (v_keep))
    and not exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);

  return v_id;
end;
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.save_route from anon, public;
grant execute on function public.save_route to authenticated;


-- ════════ supabase/migrations/0011_route_notes.sql ════════
-- YourWay — a free-text note from the driver on each route.
-- Run after 0010_recurring_start_date.sql. Safe to run again.
--
-- Shown to passengers on the ride card and the ride page. Null = no note.
-- The 200-character limit matches NOTES_MAX in lib/validation/route.ts.

alter table public.routes add column if not exists notes text;
alter table public.routes drop constraint if exists routes_notes_length;
alter table public.routes add constraint routes_notes_length check (char_length(notes) <= 200);

create or replace function public.save_route(p_route_id uuid, p_route jsonb, p_stops jsonb)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_id        uuid;
  v_kind      public.route_kind := (p_route ->> 'kind')::public.route_kind;
  v_weekdays  smallint[];
  v_stop      jsonb;
  v_stop_kind public.stop_kind;
  v_stop_id   uuid;
  v_keep      uuid[] := '{}';
  v_pickups   smallint := 0;
  v_dropoffs  smallint := 0;
  v_position  smallint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select coalesce(array_agg(d::smallint order by d::smallint), '{}')
  into v_weekdays
  from jsonb_array_elements_text(coalesce(p_route -> 'weekdays', '[]')) d;

  if p_route_id is null then
    insert into public.routes (driver_id, group_id, kind, weekdays, ride_date, out_time, return_time, seats, price, notes)
    values (
      auth.uid(),
      (p_route ->> 'group_id')::uuid,
      v_kind,
      case when v_kind = 'recurring' then v_weekdays else '{}' end,
      nullif(p_route ->> 'ride_date', '')::date,
      (p_route ->> 'out_time')::time,
      nullif(p_route ->> 'return_time', '')::time,
      (p_route ->> 'seats')::smallint,
      (p_route ->> 'price')::numeric,
      nullif(btrim(p_route ->> 'notes'), '')
    )
    returning id into v_id;
  else
    update public.routes set
      group_id    = (p_route ->> 'group_id')::uuid,
      kind        = v_kind,
      weekdays    = case when v_kind = 'recurring' then v_weekdays else '{}' end,
      ride_date   = nullif(p_route ->> 'ride_date', '')::date,
      out_time    = (p_route ->> 'out_time')::time,
      return_time = nullif(p_route ->> 'return_time', '')::time,
      seats       = (p_route ->> 'seats')::smallint,
      price       = (p_route ->> 'price')::numeric,
      notes       = nullif(btrim(p_route ->> 'notes'), '')
    where id = p_route_id and driver_id = auth.uid() and is_active
    returning id into v_id;
    if v_id is null then raise exception 'ROUTE_NOT_FOUND'; end if;
  end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    v_stop_kind := (v_stop ->> 'kind')::public.stop_kind;
    if v_stop_kind = 'pickup' then
      v_pickups := v_pickups + 1; v_position := v_pickups;
    else
      v_dropoffs := v_dropoffs + 1; v_position := v_dropoffs;
    end if;

    v_stop_id := nullif(v_stop ->> 'id', '')::uuid;
    if v_stop_id is not null then
      update public.stops set
        kind = v_stop_kind, label = v_stop ->> 'label',
        lat = (v_stop ->> 'lat')::double precision, lng = (v_stop ->> 'lng')::double precision,
        position = v_position, is_active = true
      where id = v_stop_id and route_id = v_id
      returning id into v_stop_id;
    end if;
    if v_stop_id is null then
      insert into public.stops (route_id, kind, label, lat, lng, position)
      values (v_id, v_stop_kind, v_stop ->> 'label',
              (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision, v_position)
      returning id into v_stop_id;
    end if;
    v_keep := v_keep || v_stop_id;
  end loop;

  if v_pickups = 0 or v_dropoffs = 0 then raise exception 'STOPS_REQUIRED'; end if;

  -- Stops removed from the route: archive the ones bookings point at, delete the rest.
  update public.stops s set is_active = false
  where s.route_id = v_id and s.is_active and not (s.id = any (v_keep))
    and exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);
  delete from public.stops s
  where s.route_id = v_id and not (s.id = any (v_keep))
    and not exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id);

  return v_id;
end;
$$;

-- search_rides and get_ride gain a column, and a function's result type can't
-- be changed in place — drop and recreate them.
drop function if exists public.search_rides(uuid, date, text, time, time);
create function public.search_rides(
  p_group_id  uuid default null,
  p_date      date default null,
  p_kind      text default null,
  p_from_time time default null,
  p_to_time   time default null
)
returns table (
  route_id     uuid,
  ride_date    date,
  kind         text,
  driver_id    uuid,
  driver_name  text,
  origin       text,
  destination  text,
  out_time     time,
  return_time  time,
  seats        smallint,
  seats_left   integer,
  price        numeric,
  notes        text
)
language sql stable
security definer set search_path = ''
as $$
  with days as (
    select d::date as ride_date
    from generate_series(
      coalesce(p_date, public.israel_today()),
      coalesce(p_date, public.israel_today() + 6),
      interval '1 day'
    ) d
  )
  select r.id, days.ride_date, r.kind, r.driver_id, p.full_name, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = days.ride_date and b.status = 'active')::integer,
         r.price, r.notes
  from public.routes r
  join days on public.route_runs_on(r, days.ride_date)
  join public.ride_groups g on g.id = r.group_id and g.is_active
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = days.ride_date
  where auth.uid() is not null
    and r.is_active
    and r.driver_id <> auth.uid()
    and coalesce(x.cancelled, false) = false
    and public.departure_at(days.ride_date, coalesce(x.out_time, r.out_time)) > now()
    and (p_group_id is null or r.group_id = p_group_id)
    and (p_kind is null or r.kind = p_kind::public.route_kind)
    and (p_from_time is null or coalesce(x.out_time, r.out_time) >= p_from_time)
    and (p_to_time is null or coalesce(x.out_time, r.out_time) < p_to_time)
  order by days.ride_date, coalesce(x.out_time, r.out_time)
$$;

drop function if exists public.get_ride(uuid, date);
create function public.get_ride(p_route_id uuid, p_date date)
returns table (
  route_id        uuid,
  ride_date       date,
  kind            text,
  driver_id       uuid,
  driver_name     text,
  driver_phone    text,
  driver_email    text,
  vehicle_model   text,
  vehicle_color   text,
  origin          text,
  destination     text,
  out_time        time,
  return_time     time,
  seats           smallint,
  seats_left      integer,
  price           numeric,
  notes           text,
  is_available    boolean,
  my_booking_id   uuid
)
language sql stable
security definer set search_path = ''
as $$
  with mine as (
    select b.id from public.bookings b
    where b.route_id = p_route_id and b.ride_date = p_date
      and b.passenger_id = auth.uid() and b.status = 'active'
  )
  select r.id, p_date, r.kind, r.driver_id, p.full_name,
         case when exists (select 1 from mine) then p.phone end,
         case when exists (select 1 from mine) then p.email end,
         p.vehicle_model, p.vehicle_color, g.origin, g.destination,
         coalesce(x.out_time, r.out_time), r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer,
         r.price, r.notes,
         r.is_active and public.route_runs_on(r, p_date) and coalesce(x.cancelled, false) = false
           and public.departure_at(p_date, coalesce(x.out_time, r.out_time)) > now(),
         (select id from mine)
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where auth.uid() is not null and r.id = p_route_id
$$;

revoke execute on function public.save_route, public.search_rides, public.get_ride from anon, public;
grant execute on function public.save_route, public.search_rides, public.get_ride to authenticated;


-- ════════ supabase/migrations/0012_driver_added_passengers.sql ════════
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


-- ════════ supabase/migrations/0013_unlinked_guests.sql ════════
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


-- ════════ supabase/migrations/0014_replace_guest_booking.sql ════════
-- YourWay — adding a guest again with the same phone replaces her booking.
-- Run after 0013_unlinked_guests.sql. Safe to run again.
--
-- A guest is identified by her phone's digits (050-123-4567 = 0501234567).
-- When the driver adds a phone that already holds a guest seat on the same
-- ride and date, the old booking is cancelled and the new one — with the new
-- name and stops — takes its seat. A passenger who booked herself with that
-- phone is still ALREADY_BOOKED: the driver can't cancel her booking.
-- bookings_one_active_per_guest_phone (0012) keeps one active guest booking
-- per phone and ride date.

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
  v_old    uuid;
  v_taken  integer;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(char_length(v_name), 0) not between 2 and 60 or v_name ~ '[[:cntrl:]]'
     or coalesce(v_phone, '') !~ '^0\d{1,2}-?\d{3}-?\d{4}$' then
    raise exception 'INVALID_PASSENGER';
  end if;

  -- Locking the route also serializes adds to it, so two at once can't both
  -- replace the same booking or take the last seat.
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

  -- A passenger who booked herself (the driver already sees her phone in
  -- driver_passengers).
  if exists (select 1 from public.bookings b
             join public.profiles p on p.id = b.passenger_id
             where b.route_id = p_route_id and b.ride_date = p_date and b.status = 'active'
               and public.phone_digits(p.phone) = v_digits) then
    raise exception 'ALREADY_BOOKED';
  end if;

  -- The guest booking this one replaces, if any.
  select id into v_old from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active'
    and passenger_id is null and public.phone_digits(guest_phone) = v_digits;

  -- The replaced booking's seat is free for the new one.
  select count(*) into v_taken from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active'
    and id is distinct from v_old;
  if v_taken >= v_route.seats then raise exception 'RIDE_FULL'; end if;

  if v_old is not null then
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_old;
  end if;

  insert into public.bookings (route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id,
                               added_by_driver, guest_name, guest_phone)
  values (p_route_id, p_date, null, p_pickup_stop_id, p_dropoff_stop_id, true, v_name, v_phone)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_passenger(uuid, date, text, text, uuid, uuid) from anon, public;
grant execute on function public.add_passenger(uuid, date, text, text, uuid, uuid) to authenticated;


-- ════════ supabase/migrations/0015_input_checks.sql ════════
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
