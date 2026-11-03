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
