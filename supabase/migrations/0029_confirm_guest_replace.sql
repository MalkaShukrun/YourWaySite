-- YourWay — replacing a guest booking needs the driver's confirmation.
-- Run after 0028_editable_route_notes.sql. Safe to run again.
--
-- Adding a phone that already holds a guest seat on the same ride and date
-- used to replace that booking silently (0014). Now add_passenger refuses with
-- GUEST_EXISTS — the existing guest's name in the error's detail, for the
-- question the driver is asked — unless it is called again with
-- p_replace => true. A form left open on an old page can't overwrite a
-- booking without asking. Everything else is as in 0014.

drop function if exists public.add_passenger(uuid, date, text, text, uuid, uuid);

create or replace function public.add_passenger(
  p_route_id uuid, p_date date, p_name text, p_phone text,
  p_pickup_stop_id uuid, p_dropoff_stop_id uuid, p_replace boolean default false
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := btrim(p_name);
  v_phone    text := btrim(p_phone);
  v_digits   text := public.phone_digits(p_phone);
  v_route    public.routes;
  v_old      uuid;
  v_old_name text;
  v_taken    integer;
  v_id       uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(char_length(v_name), 0) not between 2 and 60 or v_name ~ '[[:cntrl:]]'
     or coalesce(v_phone, '') !~ '^0\d{1,2}-?\d{3}-?\d{4}$' then
    raise exception 'INVALID_PASSENGER';
  end if;

  -- Locking the route also serializes adds to it, so two at once can't both
  -- replace the same booking or take the last seat.
  select * into v_route from public.routes where id = p_route_id for update;
  if not found or v_route.driver_id <> v_uid then raise exception 'ROUTE_NOT_FOUND'; end if;
  if not v_route.is_active or not public.route_runs_on(v_route, p_date)
     or exists (select 1 from public.ride_exceptions
                where route_id = p_route_id and ride_date = p_date and cancelled) then
    raise exception 'RIDE_UNAVAILABLE';
  end if;

  if not exists (select 1 from public.stops where id = p_pickup_stop_id and route_id = p_route_id
                 and kind = 'pickup' and is_active)
     or not exists (select 1 from public.stops where id = p_dropoff_stop_id and route_id = p_route_id
                    and kind = 'dropoff' and is_active) then
    raise exception 'INVALID_STOP';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and public.phone_digits(phone) = v_digits) then
    raise exception 'OWN_RIDE';
  end if;

  -- A passenger who booked herself (the driver already sees her phone in
  -- driver_passengers).
  if exists (select 1 from public.bookings b
             join public.profiles p on p.id = b.passenger_id
             where b.route_id = p_route_id and b.ride_date = p_date and b.status = 'active'
               and public.phone_digits(p.phone) = v_digits) then
    raise exception 'ALREADY_BOOKED';
  end if;

  -- The guest booking this one replaces, if any — only once the driver agreed.
  select id, guest_name into v_old, v_old_name from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active'
    and passenger_id is null and public.phone_digits(guest_phone) = v_digits;
  if v_old is not null and not coalesce(p_replace, false) then
    raise exception 'GUEST_EXISTS' using detail = v_old_name;
  end if;

  -- The replaced booking's seat is free for the new one.
  select count(*) into v_taken from public.bookings
  where route_id = p_route_id and ride_date = p_date and status = 'active'
    and id is distinct from v_old;
  if v_taken >= v_route.seats then raise exception 'RIDE_FULL'; end if;

  if v_old is not null then
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_old;
  end if;

  insert into public.bookings (route_id, ride_date, passenger_id, pickup_stop_id, dropoff_stop_id,
                               added_by_driver, guest_name, guest_phone)
  values (p_route_id, p_date, null, p_pickup_stop_id, p_dropoff_stop_id, true, v_name, v_phone)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_passenger(uuid, date, text, text, uuid, uuid, boolean) from anon, public;
grant execute on function public.add_passenger(uuid, date, text, text, uuid, uuid, boolean) to authenticated;
