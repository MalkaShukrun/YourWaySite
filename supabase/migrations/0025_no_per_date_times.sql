-- YourWay — a ride always leaves at its route's time.
-- Run after 0024_keep_past_rides.sql. Safe to run again.
--
-- Drivers could once change the departure time for a single date
-- (ride_exceptions.out_time). That feature is gone: the times saved with it
-- are cleared, and no new ones can be set. The column stays, empty, so the
-- functions that read coalesce(x.out_time, r.out_time) need no change — they
-- now always get the route's time. A ride_exceptions row is left only for a
-- date the driver cancelled.

update public.ride_exceptions set out_time = null where out_time is not null;
delete from public.ride_exceptions where not cancelled;

alter table public.ride_exceptions drop constraint if exists ride_exceptions_no_out_time;
alter table public.ride_exceptions add constraint ride_exceptions_no_out_time check (out_time is null);
