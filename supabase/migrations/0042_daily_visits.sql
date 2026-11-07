-- YourWay — the admin page's daily charts: new members, and who came in each day.
-- Run after 0041_public_stats_routes_with_rides.sql. Safe to run again.
--
-- A visit is a day a signed-in member opened the site, by Israel's date. The
-- app records the first one each day (record_visit, called from proxy.ts), so a
-- member who stays signed in counts on every day she comes back, not only on
-- the day she typed her password. Days before this migration are rebuilt from
-- what Supabase Auth kept: sign-ins and token refreshes in its audit log, and
-- when each current session started and was last used. That history is
-- partial — Auth deletes old refresh tokens and ended sessions — so those days
-- may count fewer people than came in.

create table if not exists public.daily_visits (
  day     date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (day, user_id)
);

-- No policies: only the functions below read and write it.
alter table public.daily_visits enable row level security;

create or replace function public.record_visit()
returns void
language sql volatile
security definer set search_path = ''
as $$
  insert into public.daily_visits (day, user_id)
  select public.israel_today(), p.id from public.profiles p where p.id = auth.uid()
  on conflict do nothing
$$;

revoke execute on function public.record_visit from anon, public;
grant execute on function public.record_visit to authenticated;

-- One row a day from p_from to today. Members who finished sign-up only, as
-- in admin_stats; a new member counts on the day she first signed in. A
-- member without a route is one who hadn't added any by the end of that day,
-- removed ones included: she wasn't a driver yet.
create or replace function public.admin_daily_stats(p_from date)
returns table (
  day                  date,
  new_users            bigint,
  visitors             bigint,
  non_driver_visitors  bigint
)
language sql stable
security definer set search_path = ''
as $$
  select
    d.day,
    (select count(*) from public.profiles p
     where p.phone is not null and (p.created_at at time zone 'Asia/Jerusalem')::date = d.day),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null),
    (select count(*) from public.daily_visits v
     join public.profiles p on p.id = v.user_id
     where v.day = d.day and p.phone is not null
       and not exists (select 1 from public.routes r
                       where r.driver_id = v.user_id
                         and (r.created_at at time zone 'Asia/Jerusalem')::date <= d.day))
  from (select g::date as day from generate_series(p_from, public.israel_today(), interval '1 day') g) d
  where public.is_admin()
  order by d.day
$$;

revoke execute on function public.admin_daily_stats from anon, public;
grant execute on function public.admin_daily_stats to authenticated;

-- Rebuild the days since the charts start (27.10.2026) from Auth's records.
-- Each source is read on its own, so a table this project's Auth version
-- doesn't have is skipped.
do $$
declare
  since constant date := date '2026-10-27';
begin
  -- The day each member signed up.
  insert into public.daily_visits (day, user_id)
  select (p.created_at at time zone 'Asia/Jerusalem')::date, p.id
  from public.profiles p
  where (p.created_at at time zone 'Asia/Jerusalem')::date >= since
  on conflict do nothing;

  begin
    insert into public.daily_visits (day, user_id)
    select distinct (a.created_at at time zone 'Asia/Jerusalem')::date, p.id
    from auth.audit_log_entries a
    join public.profiles p on p.id::text = a.payload ->> 'actor_id'
    where a.payload ->> 'action' in ('login', 'token_refreshed', 'user_signedup')
      and (a.created_at at time zone 'Asia/Jerusalem')::date >= since
    on conflict do nothing;
  exception when others then
    raise notice 'daily_visits: skipped the auth audit log (%)', sqlerrm;
  end;

  begin
    insert into public.daily_visits (day, user_id)
    select distinct (t.at at time zone 'Asia/Jerusalem')::date, p.id
    from auth.sessions s
    cross join lateral (values (s.created_at), (s.updated_at)) t (at)
    join public.profiles p on p.id = s.user_id
    where (t.at at time zone 'Asia/Jerusalem')::date >= since
    on conflict do nothing;
  exception when others then
    raise notice 'daily_visits: skipped auth sessions (%)', sqlerrm;
  end;

  begin
    insert into public.daily_visits (day, user_id)
    select distinct (t.created_at at time zone 'Asia/Jerusalem')::date, p.id
    from auth.refresh_tokens t
    join public.profiles p on p.id::text = t.user_id
    where (t.created_at at time zone 'Asia/Jerusalem')::date >= since
    on conflict do nothing;
  exception when others then
    raise notice 'daily_visits: skipped auth refresh tokens (%)', sqlerrm;
  end;
end $$;
