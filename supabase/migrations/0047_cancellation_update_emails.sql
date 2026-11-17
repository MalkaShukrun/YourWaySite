-- YourWay — the driver's update email also comes when a passenger cancels.
-- Run after 0046_admin_upcoming_passengers.sql. Safe to run again.
--
-- Until now only a new booking sent the update email (0036). Now a passenger
-- who cancels after the driver's last email sends it too: the updated list,
-- with her marked as cancelled in that one email, by name and boarding stop
-- only. A passenger who booked and cancelled between two emails never showed
-- in one, so she shows in neither. Bookings the driver added, and dates she
-- cancelled, still send nothing: she knows. The switch is the same one.
--
-- A driver whose update email will show the cancellation no longer also gets
-- the short cancellation email (A7, 0043): one email per cancellation.

-- As 0036. With p_since (an update), it also lists the passengers who
-- cancelled since then and were in the previous email (booked before it), with
-- is_cancelled; so a ride whose last passenger cancelled still shows. A
-- passenger who cancelled and booked the same ride again since shows once,
-- unmarked: she was in the previous email.
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
    select jsonb_agg(
             case when b.status = 'cancelled' then
               jsonb_build_object('name', p.full_name, 'phone', null, 'email', null, 'pickup', s.label,
                                  'is_new', false, 'is_cancelled', true)
             else
               jsonb_build_object(
                 'name',   case when b.added_by_driver then b.guest_name  else p.full_name end,
                 'phone',  case when b.added_by_driver then b.guest_phone else p.phone end,
                 'email',  case when b.added_by_driver then null          else p.email end,
                 'pickup', s.label
               ) || case when p_since is null then '{}'::jsonb
                         else jsonb_build_object('is_new', not b.added_by_driver and b.created_at > p_since
                                                   and not exists (select 1 from public.bookings e
                                                                   where e.route_id = b.route_id and e.ride_date = b.ride_date
                                                                     and e.passenger_id = b.passenger_id and e.status = 'cancelled'
                                                                     and e.created_at <= p_since and e.cancelled_at > p_since),
                                                 'is_cancelled', false) end
             end
           order by s.position, b.created_at) as passengers
    from public.bookings b
    left join public.profiles p on p.id = b.passenger_id
    join public.stops s on s.id = b.pickup_stop_id
    where b.route_id = r.id and b.ride_date = p_date
      and (b.status = 'active'
           or (p_since is not null and b.status = 'cancelled' and not b.added_by_driver
               and b.created_at <= p_since and b.cancelled_at > p_since
               and not exists (select 1 from public.bookings a
                               where a.route_id = b.route_id and a.ride_date = b.ride_date
                                 and a.passenger_id = b.passenger_id and a.status = 'active')))
  ) onboard on onboard.passengers is not null
  where r.driver_id = p_driver and r.is_active and public.route_runs_on(r, p_date)
    and (p_date > (now() at time zone 'Asia/Jerusalem')::date
         or r.out_time > (now() at time zone 'Asia/Jerusalem')::time)
    and not exists (select 1 from public.ride_exceptions x
                    where x.route_id = r.id and x.ride_date = p_date and x.cancelled)
$$;

revoke execute on function public.daily_email_rides from anon, authenticated, public;
grant execute on function public.daily_email_rides to service_role;

-- As 0036, also for a passenger who cancelled since the driver's last email
-- and was in it. An update goes out only when its list marks someone: a change
-- on a ride left out of it (a date the driver cancelled since) sends nothing.
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
                    and not b.added_by_driver
                    and ((b.status = 'active' and b.created_at > p.daily_email_sent_at)
                         or (b.status = 'cancelled' and b.created_at <= p.daily_email_sent_at
                             and b.cancelled_at > p.daily_email_sent_at))
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
  where list.rides is not null
    and jsonb_path_exists(list.rides, '$[*].passengers[*] ? (@.is_new == true || @.is_cancelled == true)');
end;
$$;

revoke execute on function public.claim_passenger_update_emails from anon, authenticated, public;
grant execute on function public.claim_passenger_update_emails to service_role;

-- As 0043, except the driver's cancellation email: it is left out when her
-- update email will show the cancellation, under the same conditions as
-- claim_passenger_update_emails and daily_email_rides above: the update is on,
-- her email for this date went out (and isn't waiting for a retry), the
-- passenger booked before it, and the ride is still on for that date.
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
    values ('cancelled', new.passenger_id, new.id);

    insert into public.email_outbox (kind, recipient, booking_id)
    select 'passenger_cancelled', r.driver_id, new.id
    from public.routes r
    join public.profiles d on d.id = r.driver_id
    where r.id = new.route_id
      and not coalesce(
            d.daily_email_enabled and d.daily_email_updates_enabled and d.email <> ''
            and d.daily_email_sent_for = new.ride_date and d.daily_email_retry_for is null
            and new.created_at <= d.daily_email_sent_at
            and r.is_active and public.route_runs_on(r, new.ride_date)
            and not exists (select 1 from public.ride_exceptions x
                            where x.route_id = r.id and x.ride_date = new.ride_date and x.cancelled),
            false);
  end if;
  return null;
end;
$$;

revoke execute on function public.queue_booking_emails from anon, authenticated, public;
