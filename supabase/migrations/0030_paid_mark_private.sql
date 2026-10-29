-- YourWay — a passenger's paid / unpaid mark is hers alone.
-- Run after 0029_confirm_guest_replace.sql. Safe to run again.
--
-- Drivers may read the bookings on their rides, and that read included
-- is_paid, though only the passenger may see it (SRS "who sees what"). Now
-- signed-in users can read every column of bookings except is_paid. The
-- passenger still sees her own mark through my_bookings(), and still sets it
-- (the update grant on is_paid is unchanged).

revoke select on public.bookings from authenticated;
grant select (id, route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id, status,
              created_at, cancelled_at, added_by_driver, guest_name, guest_phone, price)
  on public.bookings to authenticated;
