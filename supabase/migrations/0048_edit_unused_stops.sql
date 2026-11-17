-- YourWay — a booked route's stops that nobody chose can be edited.
-- Run after 0047_cancellation_update_emails.sql. Safe to run again.
--
-- Until now (0037) every stop of a booked route was fixed: only new stops could
-- be added. But only a stop a booking points at is part of what a passenger
-- signed up for and of her history. Now the lock is per stop:
--   • a stop no booking has ever used — on any date, cancelled ones included —
--     can be renamed, moved on the map or removed, even on a booked route;
--   • a stop a booking uses stays exactly as it is (STOP_IN_USE).
-- A route's other details stay as 0037 left them. update_booked_route() saves
-- a booked route's note and its stops together; update_route() stays for app
-- versions that only add stops.
--
-- lock_stop() locks the route row before it looks for bookings, as book_ride()
-- and add_passenger() do before booking, so a booking and a stop change can't
-- overlap: whichever comes second sees the other.

-- lock_stop() and route_stops_in_use() look bookings up by stop.
create index if not exists bookings_pickup_stop_idx  on public.bookings (pickup_stop_id);
create index if not exists bookings_dropoff_stop_idx on public.bookings (dropoff_stop_id);

-- ─── The lock ────────────────────────────────────────────────────────────────

create or replace function public.lock_stop()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  -- Deleting a route still takes its stops with it (on delete cascade): by then
  -- the route row is gone.
  if tg_op = 'DELETE' and not exists (select 1 from public.routes where id = old.route_id) then
    return old;
  end if;
  -- Nothing changes on a removed route.
  perform 1 from public.routes where id = old.route_id and is_active for update;
  if not found then raise exception 'ROUTE_LOCKED'; end if;
  if tg_op = 'UPDATE' and new.route_id is distinct from old.route_id then raise exception 'ROUTE_LOCKED'; end if;
  if exists (select 1 from public.bookings b where b.pickup_stop_id = old.id or b.dropoff_stop_id = old.id) then
    raise exception 'STOP_IN_USE' using detail = old.label;
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.lock_stop from anon, authenticated, public;

-- ─── For the editor ──────────────────────────────────────────────────────────

-- The route's stops that a booking uses: the editor shows them as fixed. Runs
-- as the caller, so only the route's driver sees its bookings.
create or replace function public.route_stops_in_use(p_route_id uuid)
returns uuid[]
language sql stable
security invoker set search_path = ''
as $$
  select coalesce(array_agg(s.id), '{}')
  from public.stops s
  where s.route_id = p_route_id
    and exists (select 1 from public.bookings b where b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id)
$$;

revoke execute on function public.route_stops_in_use from anon, public;
grant execute on function public.route_stops_in_use to authenticated;

-- Save a booked route's note and its full list of stops: a saved stop (with
-- its id) takes a new name or location, one left out of the list is removed,
-- and a new one (no id) goes after the existing ones of its kind. lock_stop()
-- refuses any change to a stop a booking uses. Saved stops keep their kind
-- and order. Runs as the caller, so RLS limits it to the driver's own routes.
create or replace function public.update_booked_route(p_route_id uuid, p_notes text, p_stops jsonb)
returns void
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_stop  jsonb;
  v_id    uuid;
  v_keep  uuid[] := '{}';
  v_new   jsonb := '[]';
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  -- Also locks the route row first, as book_ride() does.
  update public.routes set notes = nullif(btrim(p_notes), '')
  where id = p_route_id and driver_id = auth.uid() and is_active;
  if not found then raise exception 'ROUTE_NOT_FOUND'; end if;

  for v_stop in select * from jsonb_array_elements(coalesce(p_stops, '[]')) loop
    v_id := nullif(v_stop ->> 'id', '')::uuid;
    if v_id is null then
      v_new := v_new || jsonb_build_array(v_stop);
      continue;
    end if;
    if not exists (select 1 from public.stops where id = v_id and route_id = p_route_id and is_active) then
      raise exception 'STOP_NOT_FOUND';
    end if;
    -- Only a stop that really changed is written: an unchanged stop a booking
    -- uses passes untouched.
    update public.stops set
      label = v_stop ->> 'label',
      lat   = (v_stop ->> 'lat')::double precision,
      lng   = (v_stop ->> 'lng')::double precision
    where id = v_id
      and (label, lat, lng) is distinct from
          (v_stop ->> 'label', (v_stop ->> 'lat')::double precision, (v_stop ->> 'lng')::double precision);
    v_keep := v_keep || v_id;
  end loop;

  delete from public.stops where route_id = p_route_id and is_active and not (id = any (v_keep));

  if jsonb_array_length(v_new) > 0 then
    perform public.add_route_stops(p_route_id, v_new);
  end if;

  if not exists (select 1 from public.stops where route_id = p_route_id and is_active and kind = 'pickup')
     or not exists (select 1 from public.stops where route_id = p_route_id and is_active and kind = 'dropoff') then
    raise exception 'STOPS_REQUIRED';
  end if;
end;
$$;

revoke execute on function public.update_booked_route from anon, public;
grant execute on function public.update_booked_route to authenticated;
