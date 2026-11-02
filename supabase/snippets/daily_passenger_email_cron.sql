-- YourWay — schedules the daily passenger email. Run once in the production
-- SQL editor, after deploying the function (README → Daily passenger email).
-- Replace <PROJECT_REF> and <CRON_SECRET>; the secret is the same value as the
-- function's CRON_SECRET. Not a migration: it holds project-specific values.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'daily_passenger_email_cron_secret');

select cron.schedule(
  'daily-passenger-email',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-passenger-email',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'daily_passenger_email_cron_secret'
    )),
    timeout_milliseconds := 60000
  )
  $$
);

-- Check the runs:  select * from cron.job_run_details order by start_time desc limit 10;
-- Check the calls: select status_code, created from net._http_response order by created desc limit 10;
-- Stop it:         select cron.unschedule('daily-passenger-email');
