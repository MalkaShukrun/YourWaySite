-- YourWay — a ride's seats can't go below the passengers already booked.
-- Run after 0020_own_rides_in_search.sql. Safe to run again.
--
-- The route editor let the driver lower the seats below the bookings on an
-- upcoming date: nobody lost her seat, but the ride showed more passengers
-- than seats ("3 מתוך 2 מקומות"). Now the change is refused with
-- SEATS_BELOW_BOOKINGS:<n>, n being the most passengers booked on one
-- upcoming date — the lowest the seats can go. Dates that have departed, are
-- cancelled or no longer run (0018) don't count.

create or replace function public.check_seats_not_below_bookings()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booked integer;
begin
  select coalesce(max(n), 0) into v_booked
  from (
    select count(*)::integer as n
    from public.bookings b
    left join public.ride_exceptions x on x.route_id = b.route_id and x.ride_date = b.ride_date
    where b.route_id = new.id
      and b.status = 'active'
      and not coalesce(x.cancelled, false)
      and public.route_runs_on(new, b.ride_date)
      and public.departure_at(b.ride_date, coalesce(x.out_time, new.out_time)) > now()
    group by b.ride_date
  ) per_date;

  if new.seats < v_booked then
    raise exception 'SEATS_BELOW_BOOKINGS:%', v_booked;
  end if;
  return new;
end;
$$;

revoke execute on function public.check_seats_not_below_bookings from anon, authenticated, public;

drop trigger if exists routes_check_seats_not_below_bookings on public.routes;
create trigger routes_check_seats_not_below_bookings
  before update of seats on public.routes
  for each row when (new.seats < old.seats)
  execute function public.check_seats_not_below_bookings();
