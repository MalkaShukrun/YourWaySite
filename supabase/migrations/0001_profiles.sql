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

-- Create a profile automatically when someone signs in with Google for the first time.
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

-- Users may edit their own details, but never their own admin flag.
revoke update on public.profiles from authenticated;
grant update (full_name, email, phone, vehicle_model, vehicle_color, vehicle_seats)
  on public.profiles to authenticated;

-- To make someone an admin, run (as the project owner):
--   update public.profiles set is_admin = true where email = 'someone@example.com';
