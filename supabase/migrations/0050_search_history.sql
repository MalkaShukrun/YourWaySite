-- YourWay — a passenger's recent ride searches, offered under smart search.
-- Run after 0049_public_stats_count_routes.sql. Safe to run again.
--
-- A search is kept only when she runs it: "חיפוש נסיעה", or smart search's
-- arrow (or Enter in it). What's kept are the filters, never smart search's
-- text: the places picked at each end ("city:<name>" or a place id, sorted),
-- the date, the departure-time range and the ride type. The same filters run
-- again move back to the top instead of repeating. She keeps her 4 latest,
-- and none whose date has passed.

create table if not exists public.search_history (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  origins       text[] not null default '{}',
  destinations  text[] not null default '{}',
  ride_date     date,
  depart_from   time,
  depart_to     time,
  kind          text check (kind in ('recurring', 'one_time')),
  searched_at   timestamptz not null default now(),
  -- One row per search: no two with the same filters (an empty one equals another).
  constraint search_history_unique unique nulls not distinct
    (user_id, origins, destinations, ride_date, depart_from, depart_to, kind)
);

create index if not exists search_history_user_idx on public.search_history (user_id, searched_at desc);

-- She reads and clears her own; saving goes through record_search below,
-- which keeps the list to 4.
alter table public.search_history enable row level security;

drop policy if exists "search_history: read own" on public.search_history;
create policy "search_history: read own" on public.search_history
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "search_history: delete own" on public.search_history;
create policy "search_history: delete own" on public.search_history
  for delete to authenticated using (user_id = (select auth.uid()));

-- Only what the policies allow: Supabase's default grants would also give
-- insert, update and truncate (truncate ignores row level security).
revoke all on public.search_history from anon, authenticated;
grant select, delete on public.search_history to authenticated;

-- Keeps the search she just ran: first among her recent ones, the same filters
-- moved up rather than repeated. Then drops any whose date has passed and all
-- but the 4 latest. A search with no filter at all, or one for a past date,
-- isn't kept.
create or replace function public.record_search(
  p_origins      text[],
  p_destinations text[],
  p_date         date,
  p_from         time,
  p_to           time,
  p_kind         text
)
returns void
language plpgsql volatile
security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_origins text[] := coalesce((select array_agg(distinct o order by o) from unnest(p_origins) o where o is not null), '{}');
  v_destinations text[] := coalesce((select array_agg(distinct d order by d) from unnest(p_destinations) d where d is not null), '{}');
begin
  if v_user is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  if cardinality(v_origins) > 30 or cardinality(v_destinations) > 30
     or exists (select 1 from unnest(v_origins || v_destinations) x where length(x) > 60) then
    raise exception 'INVALID_SEARCH' using errcode = '22023';
  end if;
  if p_kind is not null and p_kind not in ('recurring', 'one_time') then
    raise exception 'INVALID_SEARCH' using errcode = '22023';
  end if;
  if cardinality(v_origins) = 0 and cardinality(v_destinations) = 0 and p_date is null
     and p_from is null and p_to is null and p_kind is null then
    return;
  end if;
  if p_date is not null and p_date < public.israel_today() then
    return;
  end if;

  insert into public.search_history (user_id, origins, destinations, ride_date, depart_from, depart_to, kind)
  values (v_user, v_origins, v_destinations, p_date, p_from, p_to, p_kind)
  on conflict on constraint search_history_unique do update set searched_at = now();

  delete from public.search_history
  where user_id = v_user and ride_date < public.israel_today();

  delete from public.search_history r
  where r.user_id = v_user
    and r.ctid not in (select ctid from public.search_history
                       where user_id = v_user order by searched_at desc limit 4);
end
$$;

revoke execute on function public.record_search from anon, public;
grant execute on function public.record_search to authenticated;
