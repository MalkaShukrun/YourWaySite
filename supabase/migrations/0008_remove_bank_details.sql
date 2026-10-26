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
