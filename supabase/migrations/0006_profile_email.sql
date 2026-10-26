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
