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
