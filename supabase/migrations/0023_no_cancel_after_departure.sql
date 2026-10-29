-- YourWay — a ride can't be cancelled for a date once it has left.
-- Run after 0022_lock_routes.sql. Safe to run again.
--
-- "Cancel for this date only" after the departure time told passengers a ride
-- was off when it had already taken place. The service role and the SQL
-- editor (no signed-in user) are not limited, for maintenance.

create or replace function public.no_cancel_after_departure()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depart timestamptz;
begin
  if auth.uid() is null or not new.cancelled then return new; end if;
  if tg_op = 'UPDATE' and old.cancelled then return new; end if;

  select public.departure_at(new.ride_date, r.out_time) into v_depart
  from public.routes r
  where r.id = new.route_id;

  if v_depart <= now() then raise exception 'RIDE_DEPARTED'; end if;
  return new;
end;
$$;

revoke execute on function public.no_cancel_after_departure from anon, authenticated, public;

drop trigger if exists ride_exceptions_no_cancel_after_departure on public.ride_exceptions;
create trigger ride_exceptions_no_cancel_after_departure
  before insert or update on public.ride_exceptions
  for each row execute function public.no_cancel_after_departure();
