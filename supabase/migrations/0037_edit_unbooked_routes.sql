-- YourWay — a route nobody has booked can be edited in full.
-- Run after 0036_passenger_update_emails.sql. Safe to run again.
--
-- 0022_lock_routes.sql fixed a route's details once published, so passengers
-- keep the ride they booked. A route that no passenger has ever booked — on
-- any date, past or future, and including bookings later cancelled, which stay
-- in passengers' history — has nobody to protect: its group, kind, days, date,
-- time, seats, price and stops can all change, and its stops can be renamed,
-- moved or removed. save_route() with the route's id saves it.
-- Once a route has a booking, 0028_editable_route_notes.sql's rules apply as
-- before: only its note changes and stops are added (update_route()).
--
-- book_ride() and add_passenger() lock the route row before booking, and
-- save_route() updates the route row before its stops, so a booking and an
-- edit can't overlap: whichever comes second sees the other.
--
-- The locks are now security definer so they see every booking on the route,
-- whatever the caller may read.

-- ─── Routes ──────────────────────────────────────────────────────────────────

create or replace function public.lock_route()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  -- Never put back on the schedule, and nothing changes on a removed route.
  if (new.is_active and not old.is_active)
     or (not old.is_active and to_jsonb(new) - 'is_active' is distinct from to_jsonb(old) - 'is_active') then
    raise exception 'ROUTE_LOCKED';
  end if;
  if to_jsonb(new) - 'is_active' - 'notes' is distinct from to_jsonb(old) - 'is_active' - 'notes'
     and exists (select 1 from public.bookings where route_id = old.id) then
    raise exception 'ROUTE_LOCKED';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_route from anon, authenticated, public;

-- ─── Stops ───────────────────────────────────────────────────────────────────

-- Deleting a route still takes its stops with it (on delete cascade): by then
-- the route row is gone.
create or replace function public.lock_stop()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.routes where id = old.route_id) then
    return old;
  end if;
  if exists (select 1 from public.routes where id = old.route_id and is_active)
     and not exists (select 1 from public.bookings where route_id = old.route_id) then
    return coalesce(new, old);
  end if;
  raise exception 'ROUTE_LOCKED';
end;
$$;

revoke execute on function public.lock_stop from anon, authenticated, public;
