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
