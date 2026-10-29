-- YourWay — every passenger cancellation is a regular one.
-- Run after 0025_no_per_date_times.sql. Safe to run again.
--
-- A booking cancelled less than two hours before departure used to be marked
-- 'late_cancelled': it stayed in the payment journal and kept the driver's
-- contact details visible. That rule is gone — a passenger can cancel until the
-- ride leaves, and the seat simply frees up. Bookings already marked late become
-- regular cancellations, so no charge is left behind, and the status can no
-- longer be set. The enum value stays (Postgres can't drop one in use by older
-- function bodies), but no row can hold it, so the checks for it in
-- my_bookings and the other functions never match.

create or replace function public.cancel_booking(p_booking_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_depart  timestamptz;
begin
  select * into v_booking from public.bookings
  where id = p_booking_id and passenger_id = auth.uid() and status = 'active'
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select public.departure_at(v_booking.ride_date, r.out_time) into v_depart
  from public.routes r
  where r.id = v_booking.route_id;

  if v_depart <= now() then raise exception 'RIDE_DEPARTED'; end if;

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  return 'cancelled';
end;
$$;

-- create or replace keeps the existing grants; repeated so this file stands alone.
revoke execute on function public.cancel_booking from anon, public;
grant execute on function public.cancel_booking to authenticated;

update public.bookings set status = 'cancelled' where status = 'late_cancelled';

alter table public.bookings drop constraint if exists bookings_no_late_cancelled;
alter table public.bookings add constraint bookings_no_late_cancelled check (status <> 'late_cancelled');
