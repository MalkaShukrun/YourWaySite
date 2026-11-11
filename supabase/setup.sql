-- YourWay — full database setup. Paste this whole file into Supabase → SQL Editor → Run.
-- Generated from supabase/migrations/0001–0046. Safe to run more than once.


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

-- Only into an empty table, so running this again doesn't bring back groups an
-- admin deleted or renamed.
insert into public.ride_groups (origin, destination)
select * from (values
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
) v (origin, destination)
where not exists (select 1 from public.ride_groups)
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


-- ════════ supabase/migrations/00080_enum_types.sql ════════
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


-- ════════ supabase/migrations/00081_remove_bank_details.sql ════════
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
-- Run after 00081_remove_bank_details.sql. Safe to run again.
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


-- ════════ supabase/migrations/0016_public_stats.sql ════════
-- YourWay — site-wide counts for the login page's stats row.
-- Run after 0015_input_checks.sql. Safe to run again.
--
-- Visitors aren't signed in, and row level security hides the tables from
-- them, so the counts come from one security definer function. It returns
-- totals only — never a row, a name or an id.

create or replace function public.public_stats()
returns table (members bigint, drivers bigint, rides bigint, bookings bigint)
language sql stable
security definer set search_path = ''
as $$
  select
    -- Members who finished sign-up (a phone is required to finish it).
    (select count(*) from public.profiles where phone is not null),
    -- Drivers with at least one active route.
    (select count(distinct driver_id) from public.routes where is_active),
    -- Rides still to come: active recurring routes and one-time rides from today on.
    (select count(*) from public.routes r
       join public.ride_groups g on g.id = r.group_id and g.is_active
     where r.is_active and (r.kind = 'recurring' or r.ride_date >= public.israel_today())),
    -- Seats booked so far, not counting cancellations.
    (select count(*) from public.bookings where status = 'active')
$$;

revoke execute on function public.public_stats from public;
grant execute on function public.public_stats to anon, authenticated;


-- ════════ supabase/migrations/0017_public_stats_routes.sql ════════
-- YourWay — the login page shows two totals: members and active routes.
-- Run after 0016_public_stats.sql. Safe to run again.
--
-- The returned columns change, which create or replace can't do, so the
-- function is dropped and created again.

drop function if exists public.public_stats();

create function public.public_stats()
returns table (members bigint, routes bigint)
language sql stable
security definer set search_path = ''
as $$
  select
    -- Members who finished sign-up (a phone is required to finish it).
    (select count(*) from public.profiles where phone is not null),
    -- Active ride groups ("בית שמש ← ירושלים") — the routes in the search filter.
    (select count(*) from public.ride_groups where is_active)
$$;

revoke execute on function public.public_stats from public;
grant execute on function public.public_stats to anon, authenticated;


-- ════════ supabase/migrations/0018_cancel_off_schedule_bookings.sql ════════
-- YourWay — bookings on dates a ride no longer runs are cancelled by the driver.
-- Run after 0017_public_stats_routes.sql. Safe to run again.
--
-- A booking keeps the date it was made for. When the driver moved a one-time
-- ride, dropped a weekday or a start date from a recurring one, or stopped
-- offering the route, its upcoming bookings stayed active on dates the ride
-- no longer ran: they moved to the passenger's history once the date passed
-- and were charged in her payments.
--
-- Now those dates are marked cancelled for the ride (ride_exceptions), as if
-- the driver had used "cancel for this date only": the passenger sees "הנהגת
-- ביטלה את הנסיעה" and isn't charged. Rides that already departed are left
-- as they were.

create or replace function public.cancel_off_schedule_bookings(p_route_id uuid)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.ride_exceptions (route_id, ride_date, cancelled)
  select distinct b.route_id, b.ride_date, true
  from public.bookings b
  join public.routes r on r.id = b.route_id
  where b.route_id = p_route_id
    and b.status = 'active'
    and public.departure_at(b.ride_date, coalesce(
          (select x.out_time from public.ride_exceptions x
           where x.route_id = b.route_id and x.ride_date = b.ride_date),
          r.out_time)) > now()
    and (not r.is_active or not public.route_runs_on(r, b.ride_date))
  on conflict (route_id, ride_date) do update set cancelled = true
$$;

revoke execute on function public.cancel_off_schedule_bookings from anon, authenticated, public;

-- Runs on every change to when a route runs, from the route editor
-- (save_route) or when the driver stops offering it.
create or replace function public.cancel_off_schedule_bookings_trigger()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.cancel_off_schedule_bookings(new.id);
  return null;
end;
$$;

revoke execute on function public.cancel_off_schedule_bookings_trigger from anon, authenticated, public;

drop trigger if exists routes_cancel_off_schedule_bookings on public.routes;
create trigger routes_cancel_off_schedule_bookings
  after update of kind, weekdays, ride_date, is_active on public.routes
  for each row execute function public.cancel_off_schedule_bookings_trigger();

-- Bookings already left on dates their ride no longer runs.
select public.cancel_off_schedule_bookings(id) from public.routes;


-- ════════ supabase/migrations/0019_booking_price.sql ════════
-- YourWay — a ride's price is fixed once it has departed.
-- Run after 0018_cancel_off_schedule_bookings.sql. Safe to run again.
--
-- Payments used the route's current price, so when the driver changed it,
-- rides already taken changed amount too. Each booking now keeps its own
-- price: set from the route when it's made, and kept in step with the route
-- until the ride departs. After that a price change no longer reaches it.

alter table public.bookings add column if not exists price numeric;

-- Bookings made before this take the route's price now: the price they were
-- charged at before wasn't saved.
update public.bookings b set price = r.price
from public.routes r
where r.id = b.route_id and b.price is null;

alter table public.bookings alter column price set not null;

-- Whoever makes the booking, the price comes from the route.
create or replace function public.set_booking_price()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  select r.price into new.price from public.routes r where r.id = new.route_id;
  return new;
end;
$$;

revoke execute on function public.set_booking_price from anon, authenticated, public;

drop trigger if exists bookings_set_price on public.bookings;
create trigger bookings_set_price
  before insert on public.bookings
  for each row execute function public.set_booking_price();

-- A new route price reaches the bookings whose ride hasn't departed yet.
create or replace function public.update_upcoming_booking_prices()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.bookings b set price = new.price
  where b.route_id = new.id
    and public.departure_at(b.ride_date, coalesce(
          (select x.out_time from public.ride_exceptions x
           where x.route_id = b.route_id and x.ride_date = b.ride_date),
          new.out_time)) > now();
  return null;
end;
$$;

revoke execute on function public.update_upcoming_booking_prices from anon, authenticated, public;

drop trigger if exists routes_update_upcoming_booking_prices on public.routes;
create trigger routes_update_upcoming_booking_prices
  after update of price on public.routes
  for each row when (old.price is distinct from new.price)
  execute function public.update_upcoming_booking_prices();

-- The payments journal reads the booking's own price.
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
         b.price, ps.label, ds.label,
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


-- ════════ supabase/migrations/0020_own_rides_in_search.sql ════════
-- YourWay — a driver sees her own rides in the search, as passengers see them.
-- Run after 0019_booking_price.sql. Safe to run again.
--
-- search_rides left out the signed-in driver's own rides. They're listed now,
-- so she can check how they look to passengers. Booking stays closed to her:
-- book_ride refuses it (OWN_RIDE, 0003_driver.sql) and the app shows the ride
-- without the booking button.

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
    and coalesce(x.cancelled, false) = false
    and public.departure_at(days.ride_date, coalesce(x.out_time, r.out_time)) > now()
    and (p_group_id is null or r.group_id = p_group_id)
    and (p_kind is null or r.kind = p_kind::public.route_kind)
    and (p_from_time is null or coalesce(x.out_time, r.out_time) >= p_from_time)
    and (p_to_time is null or coalesce(x.out_time, r.out_time) < p_to_time)
  order by days.ride_date, coalesce(x.out_time, r.out_time)
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.search_rides from anon, public;
grant execute on function public.search_rides to authenticated;


-- ════════ supabase/migrations/0021_seats_not_below_bookings.sql ════════
-- YourWay — a ride's seats can't go below the passengers already booked.
-- Run after 0020_own_rides_in_search.sql. Safe to run again.
--
-- The route editor let the driver lower the seats below the bookings on an
-- upcoming date: nobody lost her seat, but the ride showed more passengers
-- than seats ("3 מתוך 2 מקומות"). Now the change is refused with
-- SEATS_BELOW_BOOKINGS:<n>, n being the most passengers booked on one
-- upcoming date — the lowest the seats can go. Dates that have departed, are
-- cancelled or no longer run (0018) don't count.

create or replace function public.check_seats_not_below_bookings()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booked integer;
begin
  select coalesce(max(n), 0) into v_booked
  from (
    select count(*)::integer as n
    from public.bookings b
    left join public.ride_exceptions x on x.route_id = b.route_id and x.ride_date = b.ride_date
    where b.route_id = new.id
      and b.status = 'active'
      and not coalesce(x.cancelled, false)
      and public.route_runs_on(new, b.ride_date)
      and public.departure_at(b.ride_date, coalesce(x.out_time, new.out_time)) > now()
    group by b.ride_date
  ) per_date;

  if new.seats < v_booked then
    raise exception 'SEATS_BELOW_BOOKINGS:%', v_booked;
  end if;
  return new;
end;
$$;

revoke execute on function public.check_seats_not_below_bookings from anon, authenticated, public;

drop trigger if exists routes_check_seats_not_below_bookings on public.routes;
create trigger routes_check_seats_not_below_bookings
  before update of seats on public.routes
  for each row when (new.seats < old.seats)
  execute function public.check_seats_not_below_bookings();


-- ════════ supabase/migrations/0022_lock_routes.sql ════════
-- YourWay — a published route can't be changed, only given more stops; and a
-- date the driver cancelled stays cancelled.
-- Run after 0021_seats_not_below_bookings.sql. Safe to run again.
--
-- Passengers book a route as it was published: its days, time, seats, price
-- and stops. Changing any of them under a booking left passengers with a ride
-- they never signed up for. Now, for signed-in users:
--   • a route's details are fixed once it is created — it can only be taken
--     off the schedule (is_active → false), never put back;
--   • its stops can't be changed or removed — new ones are added with
--     add_route_stops();
--   • "cancel for this date only" can't be undone: passengers were already
--     told the ride is off (my_bookings → ride_cancelled).
-- The service role and the SQL editor (no signed-in user) are not limited,
-- for maintenance.

-- ─── Routes ──────────────────────────────────────────────────────────────────

create or replace function public.lock_route()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if to_jsonb(new) - 'is_active' is distinct from to_jsonb(old) - 'is_active'
     or (new.is_active and not old.is_active) then
    raise exception 'ROUTE_LOCKED';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_route from anon, authenticated, public;

drop trigger if exists routes_lock on public.routes;
create trigger routes_lock
  before update on public.routes
  for each row execute function public.lock_route();

-- ─── Stops ───────────────────────────────────────────────────────────────────

-- Deleting a route still takes its stops with it (on delete cascade): by then
-- the route row is gone.
create or replace function public.lock_stop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.routes where id = old.route_id) then
    return old;
  end if;
  raise exception 'ROUTE_LOCKED';
end;
$$;

revoke execute on function public.lock_stop from anon, authenticated, public;

drop trigger if exists stops_lock on public.stops;
create trigger stops_lock
  before update or delete on public.stops
  for each row execute function public.lock_stop();

-- New stops go after the route's existing ones of the same kind.
create or replace function public.add_route_stops(p_route_id uuid, p_stops jsonb)
returns void
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_stop     jsonb;
  v_kind     public.stop_kind;
  v_position smallint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from public.routes where id = p_route_id and driver_id = auth.uid() and is_active) then
    raise exception 'ROUTE_NOT_FOUND';
  end if;
  if jsonb_array_length(coalesce(p_stops, '[]')) = 0 then raise exception 'NO_NEW_STOPS'; end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    v_kind := (v_stop ->> 'kind')::public.stop_kind;
    select coalesce(max(position), 0) + 1 into v_position
    from public.stops where route_id = p_route_id and kind = v_kind;

    insert into public.stops (route_id, kind, label, lat, lng, position)
    values (p_route_id, v_kind, v_stop ->> 'label',
            (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision, v_position);
  end loop;
end;
$$;

revoke execute on function public.add_route_stops from anon, public;
grant execute on function public.add_route_stops to authenticated;

-- ─── Per-date cancellation ───────────────────────────────────────────────────

create or replace function public.lock_cancelled_ride()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or not old.cancelled then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.cancelled then return new; end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.routes where id = old.route_id) then
    return old;
  end if;
  raise exception 'RIDE_CANCELLED';
end;
$$;

revoke execute on function public.lock_cancelled_ride from anon, authenticated, public;

drop trigger if exists ride_exceptions_lock_cancelled on public.ride_exceptions;
create trigger ride_exceptions_lock_cancelled
  before update or delete on public.ride_exceptions
  for each row execute function public.lock_cancelled_ride();


-- ════════ supabase/migrations/0023_no_cancel_after_departure.sql ════════
-- YourWay — a ride can't be cancelled for a date once it has left.
-- Run after 0022_lock_routes.sql. Safe to run again.
--
-- "Cancel for this date only" after the departure time told passengers a ride
-- was off when it had already taken place. The service role and the SQL
-- editor (no signed-in user) are not limited, for maintenance.

create or replace function public.no_cancel_after_departure()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depart timestamptz;
begin
  if auth.uid() is null or not new.cancelled then return new; end if;
  if tg_op = 'UPDATE' and old.cancelled then return new; end if;

  select public.departure_at(new.ride_date, r.out_time) into v_depart
  from public.routes r
  where r.id = new.route_id;

  if v_depart <= now() then raise exception 'RIDE_DEPARTED'; end if;
  return new;
end;
$$;

revoke execute on function public.no_cancel_after_departure from anon, authenticated, public;

drop trigger if exists ride_exceptions_no_cancel_after_departure on public.ride_exceptions;
create trigger ride_exceptions_no_cancel_after_departure
  before insert or update on public.ride_exceptions
  for each row execute function public.no_cancel_after_departure();


-- ════════ supabase/migrations/0024_keep_past_rides.sql ════════
-- YourWay — a one-time ride that has already left stays in the driver's history.
-- Run after 0023_no_cancel_after_departure.sql. Safe to run again.
--
-- Removing a route takes it off the schedule (is_active → false), which also
-- dropped a ride that already happened from the driver's history. A one-time
-- ride can no longer be removed once its date and departure time have passed.
-- The service role and the SQL editor (no signed-in user) are not limited,
-- for maintenance.

create or replace function public.keep_past_ride()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or not (old.is_active and not new.is_active and old.kind = 'one_time') then
    return new;
  end if;
  if public.departure_at(old.ride_date, old.out_time) <= now() then raise exception 'RIDE_PAST'; end if;
  return new;
end;
$$;

revoke execute on function public.keep_past_ride from anon, authenticated, public;

drop trigger if exists routes_keep_past_ride on public.routes;
create trigger routes_keep_past_ride
  before update on public.routes
  for each row execute function public.keep_past_ride();


-- ════════ supabase/migrations/0025_no_per_date_times.sql ════════
-- YourWay — a ride always leaves at its route's time.
-- Run after 0024_keep_past_rides.sql. Safe to run again.
--
-- Drivers could once change the departure time for a single date
-- (ride_exceptions.out_time). That feature is gone: the times saved with it
-- are cleared, and no new ones can be set. The column stays, empty, so the
-- functions that read coalesce(x.out_time, r.out_time) need no change — they
-- now always get the route's time. A ride_exceptions row is left only for a
-- date the driver cancelled.

update public.ride_exceptions set out_time = null where out_time is not null;
delete from public.ride_exceptions where not cancelled;

alter table public.ride_exceptions drop constraint if exists ride_exceptions_no_out_time;
alter table public.ride_exceptions add constraint ride_exceptions_no_out_time check (out_time is null);


-- ════════ supabase/migrations/0026_no_late_cancellations.sql ════════
-- YourWay — every passenger cancellation is a regular one.
-- Run after 0025_no_per_date_times.sql. Safe to run again.
--
-- A booking cancelled less than two hours before departure used to be marked
-- 'late_cancelled': it stayed in the payment journal and kept the driver's
-- contact details visible. That rule is gone — a passenger can cancel until the
-- ride leaves, and the seat simply frees up. Bookings already marked late become
-- regular cancellations, so no charge is left behind, and the status can no
-- longer be set. The enum value stays (Postgres can't drop one in use by older
-- function bodies), but no row can hold it, so the checks for it in
-- my_bookings and the other functions never match.

create or replace function public.cancel_booking(p_booking_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_depart  timestamptz;
begin
  select * into v_booking from public.bookings
  where id = p_booking_id and passenger_id = auth.uid() and status = 'active'
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select public.departure_at(v_booking.ride_date, r.out_time) into v_depart
  from public.routes r
  where r.id = v_booking.route_id;

  if v_depart <= now() then raise exception 'RIDE_DEPARTED'; end if;

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  return 'cancelled';
end;
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.cancel_booking from anon, public;
grant execute on function public.cancel_booking to authenticated;

update public.bookings set status = 'cancelled' where status = 'late_cancelled';

alter table public.bookings drop constraint if exists bookings_no_late_cancelled;
alter table public.bookings add constraint bookings_no_late_cancelled check (status <> 'late_cancelled');


-- ════════ supabase/migrations/0027_hidden_groups_closed.sql ════════
-- YourWay — rides in a hidden group can't be booked.
-- Run after 0026_no_late_cancellations.sql. Safe to run again.
--
-- Hiding a group took its rides out of search, but a ride page opened from a
-- saved link still offered booking, and book_ride accepted it. Now get_ride
-- reports such a ride as unavailable and book_ride refuses it with
-- RIDE_UNAVAILABLE. What hiding leaves alone is unchanged: existing bookings
-- stay, the driver's routes keep running on her dashboard, and she can still
-- add passengers by hand (add_passenger).

create or replace function public.book_ride(
  p_route_id uuid, p_date date, p_pickup_stop_id uuid, p_dropoff_stop_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_route public.routes;
  v_taken integer;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into v_route from public.routes where id = p_route_id for update;
  if not found or not v_route.is_active or not public.route_runs_on(v_route, p_date)
     or not exists (select 1 from public.ride_groups where id = v_route.group_id and is_active) then
    raise exception 'RIDE_UNAVAILABLE';
  end if;
  if v_route.driver_id = v_uid then raise exception 'OWN_RIDE'; end if;
  if exists (select 1 from public.ride_exceptions
             where route_id = p_route_id and ride_date = p_date and cancelled)
     or public.departure_at(p_date, v_route.out_time) <= now() then
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

-- Same as in 0011, with the group's is_active in is_available.
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
         r.out_time, r.return_time, r.seats,
         r.seats - (select count(*) from public.bookings b
                    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active')::integer,
         r.price, r.notes,
         r.is_active and g.is_active and public.route_runs_on(r, p_date) and coalesce(x.cancelled, false) = false
           and public.departure_at(p_date, r.out_time) > now(),
         (select id from mine)
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join public.profiles p on p.id = r.driver_id
  left join public.ride_exceptions x on x.route_id = r.id and x.ride_date = p_date
  where auth.uid() is not null and r.id = p_route_id
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.book_ride, public.get_ride from anon, public;
grant execute on function public.book_ride, public.get_ride to authenticated;


-- ════════ supabase/migrations/0028_editable_route_notes.sql ════════
-- YourWay — a published route's note can be changed.
-- Run after 0027_hidden_groups_closed.sql. Safe to run again.
--
-- The note is free text for passengers ("I wait up to 5 minutes"), not part of
-- what they booked, so the driver can now change or clear it after publishing
-- (until the route is removed).
-- Everything else stays as 0022_lock_routes.sql left it: the route's other
-- details are fixed and its stops can only be added to. update_route() saves
-- the note and any new stops together.

create or replace function public.lock_route()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if to_jsonb(new) - 'is_active' - 'notes' is distinct from to_jsonb(old) - 'is_active' - 'notes'
     or (new.is_active and not old.is_active)
     or (new.notes is distinct from old.notes and not old.is_active) then
    raise exception 'ROUTE_LOCKED';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_route from anon, authenticated, public;

create or replace function public.update_route(p_route_id uuid, p_notes text, p_stops jsonb)
returns void
language plpgsql
security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  update public.routes set notes = nullif(btrim(p_notes), '')
  where id = p_route_id and driver_id = auth.uid() and is_active;
  if not found then raise exception 'ROUTE_NOT_FOUND'; end if;

  if jsonb_array_length(coalesce(p_stops, '[]')) > 0 then
    perform public.add_route_stops(p_route_id, p_stops);
  end if;
end;
$$;

revoke execute on function public.update_route from anon, public;
grant execute on function public.update_route to authenticated;


-- ════════ supabase/migrations/0029_confirm_guest_replace.sql ════════
-- YourWay — replacing a guest booking needs the driver's confirmation.
-- Run after 0028_editable_route_notes.sql. Safe to run again.
--
-- Adding a phone that already holds a guest seat on the same ride and date
-- used to replace that booking silently (0014). Now add_passenger refuses with
-- GUEST_EXISTS — the existing guest's name in the error's detail, for the
-- question the driver is asked — unless it is called again with
-- p_replace => true. A form left open on an old page can't overwrite a
-- booking without asking. Everything else is as in 0014.

drop function if exists public.add_passenger(uuid, date, text, text, uuid, uuid);

create or replace function public.add_passenger(
  p_route_id uuid, p_date date, p_name text, p_phone text,
  p_pickup_stop_id uuid, p_dropoff_stop_id uuid, p_replace boolean default false
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := btrim(p_name);
  v_phone    text := btrim(p_phone);
  v_digits   text := public.phone_digits(p_phone);
  v_route    public.routes;
  v_old      uuid;
  v_old_name text;
  v_taken    integer;
  v_id       uuid;
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

  -- The guest booking this one replaces, if any — only once the driver agreed.
  select id, guest_name into v_old, v_old_name from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active'
    and passenger_id is null and public.phone_digits(guest_phone) = v_digits;
  if v_old is not null and not coalesce(p_replace, false) then
    raise exception 'GUEST_EXISTS' using detail = v_old_name;
  end if;

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

revoke execute on function public.add_passenger(uuid, date, text, text, uuid, uuid, boolean) from anon, public;
grant execute on function public.add_passenger(uuid, date, text, text, uuid, uuid, boolean) to authenticated;


-- ════════ supabase/migrations/0030_paid_mark_private.sql ════════
-- YourWay — a passenger's paid / unpaid mark is hers alone.
-- Run after 0029_confirm_guest_replace.sql. Safe to run again.
--
-- Drivers may read the bookings on their rides, and that read included
-- is_paid, though only the passenger may see it (SRS "who sees what"). Now
-- signed-in users can read every column of bookings except is_paid. The
-- passenger still sees her own mark through my_bookings(), and still sets it
-- (the update grant on is_paid is unchanged).

revoke select on public.bookings from authenticated;
grant select (id, route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id, status,
              created_at, cancelled_at, added_by_driver, guest_name, guest_phone, price)
  on public.bookings to authenticated;


-- ════════ supabase/migrations/0031_daily_passenger_email.sql ════════
-- YourWay — a daily email to the driver with tomorrow's passengers.
-- Run after 0030_paid_mark_private.sql. Safe to run again.
--
-- The driver turns the email on and picks its time on her profile. The Edge
-- Function supabase/functions/daily-passenger-email runs every 5 minutes (see
-- supabase/snippets/daily_passenger_email_cron.sql) and claims the drivers
-- whose time has come.

-- daily_email_sent_for is the ride date she was last sent, so she gets one
-- email per date. Only the system writes it: users have no grant on it.
alter table public.profiles
  add column if not exists daily_email_enabled  boolean not null default false,
  add column if not exists daily_email_time     time    not null default '20:00',
  add column if not exists daily_email_sent_for date;

grant update (daily_email_enabled, daily_email_time) on public.profiles to authenticated;

-- Marks the drivers who are due as sent for tomorrow (Israel time) and returns
-- those who have passengers, with their rides. Two runs at once can't claim the
-- same driver. A run that was missed is made up for by the next one, and a
-- driver who picks a time that already passed today is due right away. Same
-- rules as driver_rides and driver_passengers (0013): a passenger the driver
-- added shows the details she entered, and those have no email. For now only
-- admins get the email (spec D7). Each run takes
-- up to 50 drivers, so a long queue can't outlast the function; the rest are
-- still due on the next run.
create or replace function public.claim_daily_passenger_emails()
returns table (
  driver_id    uuid,
  driver_name  text,
  driver_email text,
  ride_date    date,
  rides        jsonb
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now      timestamp := now() at time zone 'Asia/Jerusalem';
  v_tomorrow date      := v_now::date + 1;
begin
  return query
  with due as (
    update public.profiles u set daily_email_sent_for = v_tomorrow
    where u.id in (select p.id from public.profiles p
                   where p.daily_email_enabled and p.is_admin and p.email <> ''
                     and p.daily_email_time <= v_now::time
                     and p.daily_email_sent_for is distinct from v_tomorrow
                   limit 50
                   for update skip locked)
    returning u.id, u.full_name, u.email
  )
  select d.id, d.full_name, d.email, v_tomorrow, list.rides
  from due d
  join lateral (
    select jsonb_agg(jsonb_build_object(
             'origin', g.origin,
             'destination', g.destination,
             'out_time', to_char(r.out_time, 'HH24:MI'),
             'passengers', onboard.passengers
           ) order by r.out_time) as rides
    from public.routes r
    join public.ride_groups g on g.id = r.group_id
    join lateral (
      select jsonb_agg(jsonb_build_object(
               'name',   case when b.added_by_driver then b.guest_name  else p.full_name end,
               'phone',  case when b.added_by_driver then b.guest_phone else p.phone end,
               'email',  case when b.added_by_driver then null          else p.email end,
               'pickup', s.label
             ) order by s.position, b.created_at) as passengers
      from public.bookings b
      left join public.profiles p on p.id = b.passenger_id
      join public.stops s on s.id = b.pickup_stop_id
      where b.route_id = r.id and b.ride_date = v_tomorrow and b.status = 'active'
    ) onboard on onboard.passengers is not null
    where r.driver_id = d.id and r.is_active and public.route_runs_on(r, v_tomorrow)
      and not exists (select 1 from public.ride_exceptions x
                      where x.route_id = r.id and x.ride_date = v_tomorrow and x.cancelled)
  ) list on list.rides is not null;
end;
$$;

revoke execute on function public.claim_daily_passenger_emails from anon, authenticated, public;
grant execute on function public.claim_daily_passenger_emails to service_role;


-- ════════ supabase/migrations/0032_personal_codes.sql ════════
-- YourWay — sign-in with a permanent personal code, for addresses an admin approved.
-- Run after 0031_daily_passenger_email.sql. Safe to run again.
--
-- Supabase's Email provider stays off, so nobody can sign up or ask for a code
-- with the public key. The admin gets each user's code and passes it on
-- herself. Only a hash is stored, so a lost code is replaced, not looked up.

-- Addresses are stored lower-case, as auth.users stores them. The attempt
-- columns are the limit in claim_code_attempt: only the system writes them.
create table if not exists public.otp_emails (
  email         text primary key check (email <> '' and email = lower(btrim(email))),
  created_at    timestamptz not null default now(),
  code_hash     text not null,
  attempts_from timestamptz,
  attempt_count integer not null default 0
);

alter table public.otp_emails enable row level security;

drop policy if exists "otp_emails: admins manage" on public.otp_emails;
create policy "otp_emails: admins manage" on public.otp_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Admins list and remove addresses. Rows are written with the secret key,
-- which also writes the hash.
revoke all on public.otp_emails from anon, authenticated;
grant select (email, created_at), delete on public.otp_emails to authenticated;

-- Counts one sign-in attempt and returns the hash to check it against. Null
-- when the address isn't listed or used its 10 attempts this hour, so a code
-- can't be guessed.
create or replace function public.claim_code_attempt(p_email text)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_window_start timestamptz := now() - interval '1 hour';
  v_hash         text;
begin
  update public.otp_emails e
  set attempt_count = case when e.attempts_from > v_window_start then e.attempt_count + 1 else 1 end,
      attempts_from = case when e.attempts_from > v_window_start then e.attempts_from else now() end
  where e.email = p_email
    and (e.attempts_from is null or e.attempts_from <= v_window_start or e.attempt_count < 10)
  returning e.code_hash into v_hash;
  return v_hash;
end;
$$;

revoke execute on function public.claim_code_attempt from anon, authenticated, public;
grant execute on function public.claim_code_attempt to service_role;


-- ════════ supabase/migrations/0033_admin_stats.sql ════════
-- YourWay — site-wide totals on the admin page.
-- Run after 0032_personal_codes.sql. Safe to run again.
--
-- Bookings' access rules don't let an admin read other people's bookings, and
-- this shouldn't change that: the function returns totals only, to admins only.
--
-- A booking is one passenger on one ride, guests included, so someone who rides
-- out and back counts twice. A date the driver cancelled keeps its bookings
-- active (ride_exceptions), so it's left out explicitly. A ride that departed
-- with nobody booked leaves no trace and isn't counted: past dates of a
-- recurring route can't be rebuilt from today's schedule.

create or replace function public.admin_stats()
returns table (
  users                bigint,
  rides_today          bigint,
  passengers_today     bigint,
  rides_departed       bigint,
  passengers_departed  bigint
)
language sql stable
security definer set search_path = ''
as $$
  with onboard as (
    select b.route_id, b.ride_date,
           public.departure_at(b.ride_date, r.out_time) <= now() as departed
    from public.bookings b
    join public.routes r on r.id = b.route_id
    where b.status = 'active'
      and not exists (select 1 from public.ride_exceptions x
                      where x.route_id = b.route_id and x.ride_date = b.ride_date and x.cancelled)
  )
  select
    -- Members who finished sign-up, as on the login page (public_stats).
    (select count(*) from public.profiles where phone is not null),
    -- Scheduled today, booked or not, including those that already left.
    (select count(*) from public.routes r
     where r.is_active and public.route_runs_on(r, public.israel_today())
       and not exists (select 1 from public.ride_exceptions x
                       where x.route_id = r.id and x.ride_date = public.israel_today() and x.cancelled)),
    (select count(*) from onboard where ride_date = public.israel_today()),
    (select count(distinct (route_id, ride_date)) from onboard where departed),
    (select count(*) from onboard where departed)
  where public.is_admin()
$$;

revoke execute on function public.admin_stats from anon, public;
grant execute on function public.admin_stats to authenticated;


-- ════════ supabase/migrations/0034_daily_email_all_drivers.sql ════════
-- YourWay — the daily passenger email goes to every driver who turns it on,
-- not only admins (spec D7). Run after 0033_admin_stats.sql. Safe to run again.
--
-- Same as claim_daily_passenger_emails in 0031, without the admin check:
-- marks the drivers who are due as sent for tomorrow (Israel time) and returns
-- those who have passengers, with their rides. Two runs at once can't claim the
-- same driver. A run that was missed is made up for by the next one, and a
-- driver who picks a time that already passed today is due right away. A
-- passenger the driver added shows the details she entered, and those have no
-- email. Each run takes up to 50 drivers, so a long queue can't outlast the
-- function; the rest are still due on the next run.
create or replace function public.claim_daily_passenger_emails()
returns table (
  driver_id    uuid,
  driver_name  text,
  driver_email text,
  ride_date    date,
  rides        jsonb
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now      timestamp := now() at time zone 'Asia/Jerusalem';
  v_tomorrow date      := v_now::date + 1;
begin
  return query
  with due as (
    update public.profiles u set daily_email_sent_for = v_tomorrow
    where u.id in (select p.id from public.profiles p
                   where p.daily_email_enabled and p.email <> ''
                     and p.daily_email_time <= v_now::time
                     and p.daily_email_sent_for is distinct from v_tomorrow
                   limit 50
                   for update skip locked)
    returning u.id, u.full_name, u.email
  )
  select d.id, d.full_name, d.email, v_tomorrow, list.rides
  from due d
  join lateral (
    select jsonb_agg(jsonb_build_object(
             'origin', g.origin,
             'destination', g.destination,
             'out_time', to_char(r.out_time, 'HH24:MI'),
             'passengers', onboard.passengers
           ) order by r.out_time) as rides
    from public.routes r
    join public.ride_groups g on g.id = r.group_id
    join lateral (
      select jsonb_agg(jsonb_build_object(
               'name',   case when b.added_by_driver then b.guest_name  else p.full_name end,
               'phone',  case when b.added_by_driver then b.guest_phone else p.phone end,
               'email',  case when b.added_by_driver then null          else p.email end,
               'pickup', s.label
             ) order by s.position, b.created_at) as passengers
      from public.bookings b
      left join public.profiles p on p.id = b.passenger_id
      join public.stops s on s.id = b.pickup_stop_id
      where b.route_id = r.id and b.ride_date = v_tomorrow and b.status = 'active'
    ) onboard on onboard.passengers is not null
    where r.driver_id = d.id and r.is_active and public.route_runs_on(r, v_tomorrow)
      and not exists (select 1 from public.ride_exceptions x
                      where x.route_id = r.id and x.ride_date = v_tomorrow and x.cancelled)
  ) list on list.rides is not null;
end;
$$;

revoke execute on function public.claim_daily_passenger_emails from anon, authenticated, public;
grant execute on function public.claim_daily_passenger_emails to service_role;


-- ════════ supabase/migrations/0035_daily_email_retry_after_midnight.sql ════════
-- YourWay — a failed daily email keeps its ride date past midnight.
-- Run after 0034_daily_email_all_drivers.sql. Safe to run again.
--
-- Before this, a failed send was released by clearing daily_email_sent_for, so
-- only "tomorrow" could be claimed again. A driver whose time is 23:55 had one
-- try: after midnight "tomorrow" is a new date, and her email was lost.
--
-- Now the function records the date of a failed send in daily_email_retry_for,
-- and every run claims it again until that date is over. On the ride day itself
-- the email lists only rides that haven't left yet. Only the system writes it:
-- users have no grant on it.
alter table public.profiles
  add column if not exists daily_email_retry_for date;

-- Same as 0034, plus the retry: a driver with a failed send for a date that
-- isn't over is due at once, for that date, whatever her time. One email per
-- driver per run, the retry first; tomorrow's comes on a later run.
create or replace function public.claim_daily_passenger_emails()
returns table (
  driver_id    uuid,
  driver_name  text,
  driver_email text,
  ride_date    date,
  rides        jsonb
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now      timestamp := now() at time zone 'Asia/Jerusalem';
  v_today    date      := v_now::date;
  v_tomorrow date      := v_now::date + 1;
begin
  return query
  with picked as (
    select p.id,
           case when p.daily_email_retry_for >= v_today then p.daily_email_retry_for else v_tomorrow end as target
    from public.profiles p
    where p.daily_email_enabled and p.email <> ''
      and (p.daily_email_retry_for >= v_today
           or (p.daily_email_time <= v_now::time and p.daily_email_sent_for is distinct from v_tomorrow))
    limit 50
    for update skip locked
  ),
  due as (
    update public.profiles u set daily_email_sent_for = k.target, daily_email_retry_for = null
    from picked k
    where u.id = k.id
    returning u.id, u.full_name, u.email, k.target
  )
  select d.id, d.full_name, d.email, d.target, list.rides
  from due d
  join lateral (
    select jsonb_agg(jsonb_build_object(
             'origin', g.origin,
             'destination', g.destination,
             'out_time', to_char(r.out_time, 'HH24:MI'),
             'passengers', onboard.passengers
           ) order by r.out_time) as rides
    from public.routes r
    join public.ride_groups g on g.id = r.group_id
    join lateral (
      select jsonb_agg(jsonb_build_object(
               'name',   case when b.added_by_driver then b.guest_name  else p.full_name end,
               'phone',  case when b.added_by_driver then b.guest_phone else p.phone end,
               'email',  case when b.added_by_driver then null          else p.email end,
               'pickup', s.label
             ) order by s.position, b.created_at) as passengers
      from public.bookings b
      left join public.profiles p on p.id = b.passenger_id
      join public.stops s on s.id = b.pickup_stop_id
      where b.route_id = r.id and b.ride_date = d.target and b.status = 'active'
    ) onboard on onboard.passengers is not null
    where r.driver_id = d.id and r.is_active and public.route_runs_on(r, d.target)
      and (d.target > v_today or r.out_time > v_now::time)
      and not exists (select 1 from public.ride_exceptions x
                      where x.route_id = r.id and x.ride_date = d.target and x.cancelled)
  ) list on list.rides is not null;
end;
$$;

revoke execute on function public.claim_daily_passenger_emails from anon, authenticated, public;
grant execute on function public.claim_daily_passenger_emails to service_role;


-- ════════ supabase/migrations/0036_passenger_update_emails.sql ════════
-- YourWay — an update email when a passenger books after the daily email.
-- Run after 0035_daily_email_retry_after_midnight.sql. Safe to run again.
--
-- The driver turns it on with a second switch on her profile (spec D7). Once
-- her daily email for a date went out, every run checks for passengers who
-- booked that date since her last email, and sends her the updated full list
-- with them marked. Passengers she added herself don't count: she knows.
--
-- daily_email_sent_at is when her last email for daily_email_sent_for was
-- claimed. Only the system writes it: users have no grant on it.
alter table public.profiles
  add column if not exists daily_email_updates_enabled boolean not null default false,
  add column if not exists daily_email_sent_at         timestamptz;

grant update (daily_email_updates_enabled) on public.profiles to authenticated;

-- The list both emails carry: the driver's rides on that date by departure
-- time, each with its active passengers by stop; null when there are none.
-- Same rules as driver_rides and driver_passengers (0013): a passenger the
-- driver added shows the details she entered, and those have no email. Rides
-- with no passenger, cancelled dates and, on the ride day itself, rides that
-- already left are left out. With p_since (an update), each passenger also has
-- is_new: she booked herself after that moment.
create or replace function public.daily_email_rides(p_driver uuid, p_date date, p_since timestamptz default null)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
           'origin', g.origin,
           'destination', g.destination,
           'out_time', to_char(r.out_time, 'HH24:MI'),
           'passengers', onboard.passengers
         ) order by r.out_time)
  from public.routes r
  join public.ride_groups g on g.id = r.group_id
  join lateral (
    select jsonb_agg(jsonb_build_object(
             'name',   case when b.added_by_driver then b.guest_name  else p.full_name end,
             'phone',  case when b.added_by_driver then b.guest_phone else p.phone end,
             'email',  case when b.added_by_driver then null          else p.email end,
             'pickup', s.label
           ) || case when p_since is null then '{}'::jsonb
                     else jsonb_build_object('is_new', not b.added_by_driver and b.created_at > p_since) end
           order by s.position, b.created_at) as passengers
    from public.bookings b
    left join public.profiles p on p.id = b.passenger_id
    join public.stops s on s.id = b.pickup_stop_id
    where b.route_id = r.id and b.ride_date = p_date and b.status = 'active'
  ) onboard on onboard.passengers is not null
  where r.driver_id = p_driver and r.is_active and public.route_runs_on(r, p_date)
    and (p_date > (now() at time zone 'Asia/Jerusalem')::date
         or r.out_time > (now() at time zone 'Asia/Jerusalem')::time)
    and not exists (select 1 from public.ride_exceptions x
                    where x.route_id = r.id and x.ride_date = p_date and x.cancelled)
$$;

-- It returns passengers' details: only the claim functions below call it.
revoke execute on function public.daily_email_rides from anon, authenticated, public;
grant execute on function public.daily_email_rides to service_role;

-- Same as 0035, with the list from daily_email_rides, and it also records when
-- the email was claimed.
create or replace function public.claim_daily_passenger_emails()
returns table (
  driver_id    uuid,
  driver_name  text,
  driver_email text,
  ride_date    date,
  rides        jsonb
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now      timestamp := now() at time zone 'Asia/Jerusalem';
  v_today    date      := v_now::date;
  v_tomorrow date      := v_now::date + 1;
begin
  return query
  with picked as (
    select p.id,
           case when p.daily_email_retry_for >= v_today then p.daily_email_retry_for else v_tomorrow end as target
    from public.profiles p
    where p.daily_email_enabled and p.email <> ''
      and (p.daily_email_retry_for >= v_today
           or (p.daily_email_time <= v_now::time and p.daily_email_sent_for is distinct from v_tomorrow))
    limit 50
    for update skip locked
  ),
  due as (
    update public.profiles u
    set daily_email_sent_for = k.target, daily_email_retry_for = null, daily_email_sent_at = now()
    from picked k
    where u.id = k.id
    returning u.id, u.full_name, u.email, k.target
  )
  select d.id, d.full_name, d.email, d.target, list.rides
  from due d
  cross join lateral (select public.daily_email_rides(d.id, d.target) as rides) list
  where list.rides is not null;
end;
$$;

revoke execute on function public.claim_daily_passenger_emails from anon, authenticated, public;
grant execute on function public.claim_daily_passenger_emails to service_role;

-- The drivers who turned updates on, whose daily email for a date that isn't
-- over went out, and who have a passenger who booked a ride of that date that
-- hasn't left since their last email. Marks the email as sent now and returns
-- the full list, as the daily email does, with is_new on those passengers;
-- since is the previous sent time, for releasing a failed send. A driver whose
-- daily email is waiting for a retry is left to it: the retry has the full list.
create or replace function public.claim_passenger_update_emails()
returns table (
  driver_id    uuid,
  driver_name  text,
  driver_email text,
  ride_date    date,
  rides        jsonb,
  since        timestamptz
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now   timestamp := now() at time zone 'Asia/Jerusalem';
  v_today date      := v_now::date;
begin
  return query
  with picked as (
    select p.id, p.daily_email_sent_for as target, p.daily_email_sent_at as previous
    from public.profiles p
    where p.daily_email_enabled and p.daily_email_updates_enabled and p.email <> ''
      and p.daily_email_sent_for >= v_today and p.daily_email_retry_for is null
      and p.daily_email_sent_at is not null
      and exists (select 1 from public.bookings b
                  join public.routes r on r.id = b.route_id
                  where r.driver_id = p.id and b.ride_date = p.daily_email_sent_for
                    and b.status = 'active' and not b.added_by_driver
                    and b.created_at > p.daily_email_sent_at
                    and (p.daily_email_sent_for > v_today or r.out_time > v_now::time))
    limit 50
    for update skip locked
  ),
  due as (
    update public.profiles u set daily_email_sent_at = now()
    from picked k
    where u.id = k.id
    returning u.id, u.full_name, u.email, k.target, k.previous
  )
  select d.id, d.full_name, d.email, d.target, list.rides, d.previous
  from due d
  cross join lateral (select public.daily_email_rides(d.id, d.target, d.previous) as rides) list
  where list.rides is not null;
end;
$$;

revoke execute on function public.claim_passenger_update_emails from anon, authenticated, public;
grant execute on function public.claim_passenger_update_emails to service_role;


-- ════════ supabase/migrations/0037_edit_unbooked_routes.sql ════════
-- YourWay — a route nobody has booked can be edited in full.
-- Run after 0036_passenger_update_emails.sql. Safe to run again.
--
-- 0022_lock_routes.sql fixed a route's details once published, so passengers
-- keep the ride they booked. A route that no passenger has ever booked — on
-- any date, past or future, and including bookings later cancelled, which stay
-- in passengers' history — has nobody to protect: its group, kind, days, date,
-- time, seats, price and stops can all change, and its stops can be renamed,
-- moved or removed. save_route() with the route's id saves it.
-- Once a route has a booking, 0028_editable_route_notes.sql's rules apply as
-- before: only its note changes and stops are added (update_route()).
--
-- book_ride() and add_passenger() lock the route row before booking, and
-- save_route() updates the route row before its stops, so a booking and an
-- edit can't overlap: whichever comes second sees the other.
--
-- The locks are now security definer so they see every booking on the route,
-- whatever the caller may read.

-- ─── Routes ──────────────────────────────────────────────────────────────────

create or replace function public.lock_route()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  -- Never put back on the schedule, and nothing changes on a removed route.
  if (new.is_active and not old.is_active)
     or (not old.is_active and to_jsonb(new) - 'is_active' is distinct from to_jsonb(old) - 'is_active') then
    raise exception 'ROUTE_LOCKED';
  end if;
  if to_jsonb(new) - 'is_active' - 'notes' is distinct from to_jsonb(old) - 'is_active' - 'notes'
     and exists (select 1 from public.bookings where route_id = old.id) then
    raise exception 'ROUTE_LOCKED';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_route from anon, authenticated, public;

-- ─── Stops ───────────────────────────────────────────────────────────────────

-- Deleting a route still takes its stops with it (on delete cascade): by then
-- the route row is gone.
create or replace function public.lock_stop()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.routes where id = old.route_id) then
    return old;
  end if;
  if exists (select 1 from public.routes where id = old.route_id and is_active)
     and not exists (select 1 from public.bookings where route_id = old.route_id) then
    return coalesce(new, old);
  end if;
  raise exception 'ROUTE_LOCKED';
end;
$$;

revoke execute on function public.lock_stop from anon, authenticated, public;


-- ════════ supabase/migrations/0038_group_cities_and_neighborhoods.sql ════════
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


-- ════════ supabase/migrations/0039_group_neighborhood_required.sql ════════
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


-- ════════ supabase/migrations/0040_places.sql ════════
-- YourWay — one list of places; a ride group goes from one place to another.
-- Run after 0039_group_neighborhood_required.sql. Safe to run again.
--
-- A place is a city and a neighborhood or area inside it ("בית שמש, רמה ג").
-- Admins keep the list on group management, and a group picks its origin and
-- destination from it (origin_place_id, destination_place_id), so the same
-- place is always written the same way. Renaming a place renames it in every
-- group that uses it. A place a group uses can't be deleted.
--
-- The group's own name columns (origin, destination and their city and
-- neighborhood, 0038) stay, filled from its places by the database, so every
-- function that shows a group's name is unchanged.
--
-- Existing groups get their places from their current names: each different
-- city + neighborhood becomes one place.

-- ─── Places ──────────────────────────────────────────────────────────────────

create table if not exists public.places (
  id           uuid primary key default gen_random_uuid(),
  city         text not null,
  neighborhood text not null,
  name         text generated always as (city || ', ' || neighborhood) stored,
  created_at   timestamptz not null default now(),
  unique (city, neighborhood),
  -- Trimmed, so the same place can't be added twice with other spacing; no
  -- comma in the city, so "city, neighborhood" always splits back the same.
  constraint places_names check (
    char_length(city) between 2 and 40 and char_length(neighborhood) between 2 and 40
    and city = btrim(city) and neighborhood = btrim(neighborhood)
    and position(',' in city) = 0
  )
);

alter table public.places enable row level security;

-- Like the groups: everyone signed in can read; only admins write.
drop policy if exists "Read places" on public.places;
create policy "Read places" on public.places for select to authenticated using (true);
drop policy if exists "Admins manage places" on public.places;
create policy "Admins manage places" on public.places for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.places (city, neighborhood)
select distinct v.city, v.neighborhood
from public.ride_groups g
cross join lateral (values (g.origin_city, g.origin_neighborhood),
                           (g.destination_city, g.destination_neighborhood)) v (city, neighborhood)
on conflict (city, neighborhood) do nothing;

-- ─── Groups ──────────────────────────────────────────────────────────────────

-- 0038 split the names the group was given; now they come from its places.
drop trigger if exists ride_groups_places on public.ride_groups;
drop function if exists public.ride_group_places();

alter table public.ride_groups
  add column if not exists origin_place_id      uuid references public.places (id),
  add column if not exists destination_place_id uuid references public.places (id);

update public.ride_groups g
set origin_place_id = o.id, destination_place_id = d.id
from public.places o, public.places d
where (g.origin_place_id is null or g.destination_place_id is null)
  and o.city = g.origin_city and o.neighborhood = g.origin_neighborhood
  and d.city = g.destination_city and d.neighborhood = g.destination_neighborhood;

alter table public.ride_groups
  alter column origin_place_id      set not null,
  alter column destination_place_id set not null;

alter table public.ride_groups drop constraint if exists ride_groups_place_pair;
alter table public.ride_groups add constraint ride_groups_place_pair unique (origin_place_id, destination_place_id);
alter table public.ride_groups drop constraint if exists ride_groups_places_differ;
alter table public.ride_groups add constraint ride_groups_places_differ check (origin_place_id <> destination_place_id);

-- The unique key above covers looking up by origin; this one, by destination
-- (deleting a place checks both).
create index if not exists ride_groups_destination_place on public.ride_groups (destination_place_id);

-- A group's names, always from its places.
create or replace function public.ride_group_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select city, neighborhood, name into new.origin_city, new.origin_neighborhood, new.origin
  from public.places where id = new.origin_place_id;
  select city, neighborhood, name into new.destination_city, new.destination_neighborhood, new.destination
  from public.places where id = new.destination_place_id;
  return new;
end;
$$;

revoke execute on function public.ride_group_names from anon, authenticated, public;

drop trigger if exists ride_groups_names on public.ride_groups;
create trigger ride_groups_names
  before insert or update on public.ride_groups
  for each row execute function public.ride_group_names();

-- A renamed place renames the groups that use it (the trigger above refills them).
create or replace function public.rename_place_groups()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.ride_groups set origin_place_id = origin_place_id
  where origin_place_id = new.id or destination_place_id = new.id;
  return null;
end;
$$;

revoke execute on function public.rename_place_groups from anon, authenticated, public;

drop trigger if exists places_rename_groups on public.places;
create trigger places_rename_groups
  after update of city, neighborhood on public.places
  for each row execute function public.rename_place_groups();


-- ════════ supabase/migrations/0041_public_stats_routes_with_rides.sql ════════
-- YourWay — the login page's route total counts only routes that have a ride.
-- Run after 0040_places.sql. Safe to run again.
--
-- A route ("בית שמש ← ירושלים", a shown ride group) is counted when at least
-- one of its rides is still active, as in the driver's "מסלולים פעילים" tab
-- and on the admin page: not removed, and not a one-time ride that took place
-- or was cancelled for its date. Groups nobody drives on are left out.

create or replace function public.public_stats()
returns table (members bigint, routes bigint)
language sql stable
security definer set search_path = ''
as $$
  select
    -- Members who finished sign-up (a phone is required to finish it).
    (select count(*) from public.profiles where phone is not null),
    -- Shown ride groups with at least one active ride.
    (select count(*) from public.ride_groups g
     where g.is_active
       and exists (
         select 1 from public.routes r
         where r.group_id = g.id and r.is_active
           and (r.kind = 'recurring'
                or (public.departure_at(r.ride_date, r.out_time) > now()
                    and not exists (select 1 from public.ride_exceptions x
                                    where x.route_id = r.id and x.ride_date = r.ride_date and x.cancelled)))))
$$;

revoke execute on function public.public_stats from public;
grant execute on function public.public_stats to anon, authenticated;


-- ════════ supabase/migrations/0042_daily_visits.sql ════════
-- YourWay — the admin page's daily charts: new members, and who came in each day.
-- Run after 0041_public_stats_routes_with_rides.sql. Safe to run again.
--
-- A visit is a day a signed-in member opened the site, by Israel's date. The
-- app records the first one each day (record_visit, called from proxy.ts), so a
-- member who stays signed in counts on every day she comes back, not only on
-- the day she typed her password. Days before this migration are rebuilt from
-- what Supabase Auth kept: sign-ins and token refreshes in its audit log, and
-- when each current session started and was last used. That history is
-- partial — Auth deletes old refresh tokens and ended sessions — so those days
-- may count fewer people than came in.

create table if not exists public.daily_visits (
  day     date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (day, user_id)
);

-- No policies: only the functions below read and write it.
alter table public.daily_visits enable row level security;

create or replace function public.record_visit()
returns void
language sql volatile
security definer set search_path = ''
as $$
  insert into public.daily_visits (day, user_id)
  select public.israel_today(), p.id from public.profiles p where p.id = auth.uid()
  on conflict do nothing
$$;

revoke execute on function public.record_visit from anon, public;
grant execute on function public.record_visit to authenticated;

-- One row a day from p_from to today. Members who finished sign-up only, as
-- in admin_stats; a new member counts on the day she first signed in. A
-- member without a route is one who hadn't added any by the end of that day,
-- removed ones included: she wasn't a driver yet.
create or replace function public.admin_daily_stats(p_from date)
returns table (
  day                  date,
  new_users            bigint,
  visitors             bigint,
  non_driver_visitors  bigint
)
language sql stable
security definer set search_path = ''
as $$
  select
    d.day,
    (select count(*) from public.profiles p
     where p.phone is not null and (p.created_at at time zone 'Asia/Jerusalem')::date = d.day),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null
       and not exists (select 1 from public.routes r
                       where r.driver_id = v.user_id
                         and (r.created_at at time zone 'Asia/Jerusalem')::date <= d.day))
  from (select g::date as day from generate_series(p_from, public.israel_today(), interval '1 day') g) d
  where public.is_admin()
  order by d.day
$$;

revoke execute on function public.admin_daily_stats from anon, public;
grant execute on function public.admin_daily_stats to authenticated;

-- Rebuild the days since the charts start (27.10.2026) from Auth's records.
-- Each source is read on its own, so a table this project's Auth version
-- doesn't have is skipped.
do $$
declare
  since constant date := date '2026-10-27';
begin
  -- The day each member signed up.
  insert into public.daily_visits (day, user_id)
  select (p.created_at at time zone 'Asia/Jerusalem')::date, p.id
  from public.profiles p
  where (p.created_at at time zone 'Asia/Jerusalem')::date >= since
  on conflict do nothing;

  begin
    insert into public.daily_visits (day, user_id)
    select distinct (a.created_at at time zone 'Asia/Jerusalem')::date, p.id
    from auth.audit_log_entries a
    join public.profiles p on p.id::text = a.payload ->> 'actor_id'
    where a.payload ->> 'action' in ('login', 'token_refreshed', 'user_signedup')
      and (a.created_at at time zone 'Asia/Jerusalem')::date >= since
    on conflict do nothing;
  exception when others then
    raise notice 'daily_visits: skipped the auth audit log (%)', sqlerrm;
  end;

  begin
    insert into public.daily_visits (day, user_id)
    select distinct (t.at at time zone 'Asia/Jerusalem')::date, p.id
    from auth.sessions s
    cross join lateral (values (s.created_at), (s.updated_at)) t (at)
    join public.profiles p on p.id = s.user_id
    where (t.at at time zone 'Asia/Jerusalem')::date >= since
    on conflict do nothing;
  exception when others then
    raise notice 'daily_visits: skipped auth sessions (%)', sqlerrm;
  end;

  begin
    insert into public.daily_visits (day, user_id)
    select distinct (t.created_at at time zone 'Asia/Jerusalem')::date, p.id
    from auth.refresh_tokens t
    join public.profiles p on p.id::text = t.user_id
    where (t.created_at at time zone 'Asia/Jerusalem')::date >= since
    on conflict do nothing;
  exception when others then
    raise notice 'daily_visits: skipped auth refresh tokens (%)', sqlerrm;
  end;
end $$;


-- ════════ supabase/migrations/0043_ride_emails.sql ════════
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


-- ════════ supabase/migrations/0044_daily_passengers.sql ════════
-- YourWay — the admin page's daily charts also show how many passengers rode each day.
-- Run after 0043_ride_emails.sql. Safe to run again.
--
-- Counted as in admin_stats' "טרמפיסטיות שנסעו עד היום" (0033): each active
-- booking on a ride that has departed, guests included, so someone who rides
-- out and back counts twice. A date the driver cancelled is left out. Today
-- counts only the rides that have left so far.

-- The returned columns change, which "create or replace" can't do.
drop function if exists public.admin_daily_stats(date);

create function public.admin_daily_stats(p_from date)
returns table (
  day                  date,
  new_users            bigint,
  visitors             bigint,
  non_driver_visitors  bigint,
  passengers           bigint
)
language sql stable
security definer set search_path = ''
as $$
  select
    d.day,
    (select count(*) from public.profiles p
     where p.phone is not null and (p.created_at at time zone 'Asia/Jerusalem')::date = d.day),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null
       and not exists (select 1 from public.routes r
                       where r.driver_id = v.user_id
                         and (r.created_at at time zone 'Asia/Jerusalem')::date <= d.day)),
    (select count(*) from public.bookings b
     join public.routes r on r.id = b.route_id
     where b.ride_date = d.day and b.status = 'active'
       and public.departure_at(b.ride_date, r.out_time) <= now()
       and not exists (select 1 from public.ride_exceptions x
                       where x.route_id = b.route_id and x.ride_date = b.ride_date and x.cancelled))
  from (select g::date as day from generate_series(p_from, public.israel_today(), interval '1 day') g) d
  where public.is_admin()
  order by d.day
$$;

revoke execute on function public.admin_daily_stats from anon, public;
grant execute on function public.admin_daily_stats to authenticated;


-- ════════ supabase/migrations/0045_admin_email_stats.sql ════════
-- YourWay — the admin page counts who has each email turned on.
-- Run after 0044_daily_passengers.sql. Safe to run again.
--
-- Members who finished sign-up, as in admin_stats, for each switch on the
-- profile:
--
-- - ride_emails: "מיילים על הנסיעות שלי" (0043), for passengers and drivers.
--   It's on until she turns it off, so it counts members who never opened it.
-- - daily_email: the driver's "מייל יומי לנהגות" (0031).
-- - daily_email_updates: its "מייל עדכון על נוסעת חדשה" (0036), which is sent
--   only with the daily email, so it counts only while that's on too.

create or replace function public.admin_email_stats()
returns table (
  ride_emails          bigint,
  daily_email          bigint,
  daily_email_updates  bigint
)
language sql stable
security definer set search_path = ''
as $$
  select
    count(*) filter (where p.ride_emails_enabled),
    count(*) filter (where p.daily_email_enabled),
    count(*) filter (where p.daily_email_enabled and p.daily_email_updates_enabled)
  from public.profiles p
  where p.phone is not null
  having public.is_admin()
$$;

revoke execute on function public.admin_email_stats from anon, public;
grant execute on function public.admin_email_stats to authenticated;


-- ════════ supabase/migrations/0046_admin_upcoming_passengers.sql ════════
-- YourWay — the admin page shows how many passengers joined each of the next 7 days.
-- Run after 0045_admin_email_stats.sql. Safe to run again.
--
-- One row a day from today to 6 days ahead (Israel time). Rides are counted
-- as in admin_stats' "נסיעות יוצאות היום" (0033): every scheduled ride, booked
-- or not, on a route that isn't removed, leaving out a date the driver
-- cancelled; today includes rides that already left. Seats are those rides'
-- seats, and passengers are their active bookings, guests included, so
-- someone who rides out and back counts twice.

create or replace function public.admin_upcoming_passengers()
returns table (
  day         date,
  rides       bigint,
  seats       bigint,
  passengers  bigint
)
language sql stable
security definer set search_path = ''
as $$
  with days as (
    select (public.israel_today() + n)::date as day from generate_series(0, 6) n
  ),
  rides as (
    select d.day, r.id as route_id, r.seats
    from days d
    join public.routes r on r.is_active and public.route_runs_on(r, d.day)
    where not exists (select 1 from public.ride_exceptions x
                      where x.route_id = r.id and x.ride_date = d.day and x.cancelled)
  )
  select
    d.day,
    (select count(*) from rides where rides.day = d.day),
    (select coalesce(sum(rides.seats), 0) from rides where rides.day = d.day),
    (select count(*) from public.bookings b
     join rides on rides.route_id = b.route_id and rides.day = b.ride_date
     where b.ride_date = d.day and b.status = 'active')
  from days d
  where public.is_admin()
  order by d.day
$$;

revoke execute on function public.admin_upcoming_passengers from anon, public;
grant execute on function public.admin_upcoming_passengers to authenticated;
