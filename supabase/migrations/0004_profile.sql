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

-- The system owner is an admin (she must have signed in once before).
update public.profiles set is_admin = true where email = 'malkycohen1@gmail.com';
