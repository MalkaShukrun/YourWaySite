-- YourWay — sign-in with a permanent personal code, for addresses an admin approved.
-- Run after 0031_daily_passenger_email.sql. Safe to run again.
--
-- Supabase's Email provider stays off, so nobody can sign up or ask for a code
-- with the public key. The admin gets each user's code and passes it on
-- herself. Only a hash is stored, so a lost code is replaced, not looked up.

-- Addresses are stored lower-case, as auth.users stores them. The attempt
-- columns are the limit in claim_code_attempt: only the system writes them.
create table if not exists public.otp_emails (
  email         text primary key check (email <> '' and email = lower(btrim(email))),
  created_at    timestamptz not null default now(),
  code_hash     text not null,
  attempts_from timestamptz,
  attempt_count integer not null default 0
);

alter table public.otp_emails enable row level security;

drop policy if exists "otp_emails: admins manage" on public.otp_emails;
create policy "otp_emails: admins manage" on public.otp_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Admins list and remove addresses. Rows are written with the secret key,
-- which also writes the hash.
revoke all on public.otp_emails from anon, authenticated;
grant select (email, created_at), delete on public.otp_emails to authenticated;

-- Counts one sign-in attempt and returns the hash to check it against. Null
-- when the address isn't listed or used its 10 attempts this hour, so a code
-- can't be guessed.
create or replace function public.claim_code_attempt(p_email text)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_window_start timestamptz := now() - interval '1 hour';
  v_hash         text;
begin
  update public.otp_emails e
  set attempt_count = case when e.attempts_from > v_window_start then e.attempt_count + 1 else 1 end,
      attempts_from = case when e.attempts_from > v_window_start then e.attempts_from else now() end
  where e.email = p_email
    and (e.attempts_from is null or e.attempts_from <= v_window_start or e.attempt_count < 10)
  returning e.code_hash into v_hash;
  return v_hash;
end;
$$;

revoke execute on function public.claim_code_attempt from anon, authenticated, public;
grant execute on function public.claim_code_attempt to service_role;
