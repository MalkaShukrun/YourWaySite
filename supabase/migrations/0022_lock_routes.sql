-- YourWay — a published route can't be changed, only given more stops; and a
-- date the driver cancelled stays cancelled.
-- Run after 0021_seats_not_below_bookings.sql. Safe to run again.
--
-- Passengers book a route as it was published: its days, time, seats, price
-- and stops. Changing any of them under a booking left passengers with a ride
-- they never signed up for. Now, for signed-in users:
--   • a route's details are fixed once it is created — it can only be taken
--     off the schedule (is_active → false), never put back;
--   • its stops can't be changed or removed — new ones are added with
--     add_route_stops();
--   • "cancel for this date only" can't be undone: passengers were already
--     told the ride is off (my_bookings → ride_cancelled).
-- The service role and the SQL editor (no signed-in user) are not limited,
-- for maintenance.

-- ─── Routes ──────────────────────────────────────────────────────────────────

create or replace function public.lock_route()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if to_jsonb(new) - 'is_active' is distinct from to_jsonb(old) - 'is_active'
     or (new.is_active and not old.is_active) then
    raise exception 'ROUTE_LOCKED';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_route from anon, authenticated, public;

drop trigger if exists routes_lock on public.routes;
create trigger routes_lock
  before update on public.routes
  for each row execute function public.lock_route();

-- ─── Stops ───────────────────────────────────────────────────────────────────

-- Deleting a route still takes its stops with it (on delete cascade): by then
-- the route row is gone.
create or replace function public.lock_stop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.routes where id = old.route_id) then
    return old;
  end if;
  raise exception 'ROUTE_LOCKED';
end;
$$;

revoke execute on function public.lock_stop from anon, authenticated, public;

drop trigger if exists stops_lock on public.stops;
create trigger stops_lock
  before update or delete on public.stops
  for each row execute function public.lock_stop();

-- New stops go after the route's existing ones of the same kind.
create or replace function public.add_route_stops(p_route_id uuid, p_stops jsonb)
returns void
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_stop     jsonb;
  v_kind     public.stop_kind;
  v_position smallint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from public.routes where id = p_route_id and driver_id = auth.uid() and is_active) then
    raise exception 'ROUTE_NOT_FOUND';
  end if;
  if jsonb_array_length(coalesce(p_stops, '[]')) = 0 then raise exception 'NO_NEW_STOPS'; end if;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    v_kind := (v_stop ->> 'kind')::public.stop_kind;
    select coalesce(max(position), 0) + 1 into v_position
    from public.stops where route_id = p_route_id and kind = v_kind;

    insert into public.stops (route_id, kind, label, lat, lng, position)
    values (p_route_id, v_kind, v_stop ->> 'label',
            (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision, v_position);
  end loop;
end;
$$;

revoke execute on function public.add_route_stops from anon, public;
grant execute on function public.add_route_stops to authenticated;

-- ─── Per-date cancellation ───────────────────────────────────────────────────

create or replace function public.lock_cancelled_ride()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or not old.cancelled then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.cancelled then return new; end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.routes where id = old.route_id) then
    return old;
  end if;
  raise exception 'RIDE_CANCELLED';
end;
$$;

revoke execute on function public.lock_cancelled_ride from anon, authenticated, public;

drop trigger if exists ride_exceptions_lock_cancelled on public.ride_exceptions;
create trigger ride_exceptions_lock_cancelled
  before update or delete on public.ride_exceptions
  for each row execute function public.lock_cancelled_ride();
