-- YourWay — a published route's note can be changed.
-- Run after 0027_hidden_groups_closed.sql. Safe to run again.
--
-- The note is free text for passengers ("I wait up to 5 minutes"), not part of
-- what they booked, so the driver can now change or clear it after publishing
-- (until the route is removed).
-- Everything else stays as 0022_lock_routes.sql left it: the route's other
-- details are fixed and its stops can only be added to. update_route() saves
-- the note and any new stops together.

create or replace function public.lock_route()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if to_jsonb(new) - 'is_active' - 'notes' is distinct from to_jsonb(old) - 'is_active' - 'notes'
     or (new.is_active and not old.is_active)
     or (new.notes is distinct from old.notes and not old.is_active) then
    raise exception 'ROUTE_LOCKED';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_route from anon, authenticated, public;

create or replace function public.update_route(p_route_id uuid, p_notes text, p_stops jsonb)
returns void
language plpgsql
security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  update public.routes set notes = nullif(btrim(p_notes), '')
  where id = p_route_id and driver_id = auth.uid() and is_active;
  if not found then raise exception 'ROUTE_NOT_FOUND'; end if;

  if jsonb_array_length(coalesce(p_stops, '[]')) > 0 then
    perform public.add_route_stops(p_route_id, p_stops);
  end if;
end;
$$;

revoke execute on function public.update_route from anon, public;
grant execute on function public.update_route to authenticated;
