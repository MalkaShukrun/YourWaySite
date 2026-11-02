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
