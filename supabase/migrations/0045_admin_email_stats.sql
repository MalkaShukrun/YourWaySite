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
