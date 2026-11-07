# YourWay (בדרך שלך)

Ride-sharing and group transportation app. Next.js (App Router) + Supabase.

## Setup

1. **Supabase project** — create one at https://supabase.com.
2. **Database** — open *SQL Editor*, paste the whole of `supabase/setup.sql` and run it
   (it combines `supabase/migrations/0001–0015`; safe to run again). Optional demo rides: `supabase/seed_demo.sql`.
3. **Google login** — *Authentication → Sign In / Providers → Google*: enable it and paste the
   Client ID / Secret from Google Cloud Console (OAuth client, type "Web application").
   In Google Cloud, add the redirect URI shown by Supabase (`https://<project>.supabase.co/auth/v1/callback`).
   Google is the only sign-in method. The app has no email/password form, but the Supabase API
   still accepts email sign-ups while the **Email** provider is on, so turn it off in production
   (*Authentication → Sign In / Providers → Email*). Local Supabase (`supabase/config.toml`)
   keeps it on, because the integration and e2e tests sign in test users with a password.
4. **Redirect URLs** — *Authentication → URL Configuration*: add `http://localhost:3000/auth/callback`.
5. **Env** — copy `.env.example` to `.env.local` and fill in the URL and publishable key
   (*Project Settings → API*). In production also set `SITE_URL` to the site's public address
   (e.g. `https://yourway.onrender.com`): redirects use it, never the request's Host headers.
6. Run:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — you'll be sent to `/login`.

## Daily passenger email and ride emails

Drivers turn the daily email on in their profile and pick a time. Every member also gets emails
about her own rides — booked, cancelled, the driver cancelled, a passenger cancelled (to the
driver) — unless she turns them off (spec A7, `0043_ride_emails.sql`).
A Supabase Edge Function (`supabase/functions/daily-passenger-email`), called by `pg_cron` every
5 minutes, sends them all from a Gmail account. It needs no domain, and Gmail allows about
500 emails a day for all of them together. Nothing is sent until all of this is done:

1. **Gmail** — turn on 2-Step Verification on the sending account, then create an App Password
   at https://myaccount.google.com/apppasswords.
2. **Database** — run `supabase/migrations/0031_daily_passenger_email.sql`, `0034_daily_email_all_drivers.sql`, `0035_daily_email_retry_after_midnight.sql`, `0036_passenger_update_emails.sql` and `0043_ride_emails.sql` (or `setup.sql`). Bookings queue their emails from then on.
3. **Function** — deploy it and set its secrets (deploy it again after changing its code). `CRON_SECRET` is any long random string:
   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   npx supabase functions deploy daily-passenger-email
   npx supabase secrets set CRON_SECRET=... GMAIL_USER=...@gmail.com GMAIL_APP_PASSWORD=... SITE_URL=https://...
   ```
4. **Schedule** — fill in and run `supabase/snippets/daily_passenger_email_cron.sql` in the SQL
   editor, once. The same file shows how to check the runs and how to stop the job.

## Sign-in with a personal code

For women without a Google account. An admin adds the address on the admin page. It gets an account and a permanent 8-digit code, shown once on her screen, and she passes it on herself. A lost code is replaced with “קוד חדש”.

Keep the **Email provider off** in Supabase (Authentication → Providers). Turning it on lets anyone sign up with the public key, around the list.

Production needs `SUPABASE_SECRET_KEY` and `supabase/migrations/0032_personal_codes.sql` (or `setup.sql`). No domain is needed, because the app sends no email for this.

## Users and admins

Everyone signs in with Google on the same login page. First login opens the onboarding
modal (phone is required, vehicle is optional).

- **User** → lands on `/` (passenger home)
- **Admin** → lands on `/admin/groups`

On a new database nobody is admin yet: sign in once with the owner's account, then run
`setup.sql` again (it makes the owner admin) — or use the statement below.

To make someone an admin, run in the SQL editor (after they've logged in once):

```sql
update public.profiles set is_admin = true where email = 'someone@gmail.com';
```

Users can't change their own `is_admin` flag (enforced by column grants + RLS).

## Tests

The tests follow the scenarios in `docs/SPECIFICATION.md` and live under `tests/`:

| Folder | What it checks | Tools | Run |
|---|---|---|---|
| `tests/unit` | Dates, formatting, validation, business rules and the server actions, with Next and Supabase replaced by stand-ins | Vitest | `npm test` |
| `tests/integration` | The database itself: permissions, functions, triggers and constraints, signed in as real test users | Vitest + local Supabase | `npm run test:integration` |
| `tests/e2e` | Whole scenarios in a browser, as passengers, drivers and admins | Playwright + local Supabase | `npm run test:e2e` |

Integration and e2e tests need the local Supabase: install Docker Desktop, then run
`npx supabase start` in this folder (the first start downloads the images). They create their
own users and data and remove them afterwards; they refuse to run against anything but localhost.

The e2e tests start their own copy of the app on port 3100 (build folder `.next-e2e`), so
`npm run dev` can stay open. The first run needs a browser: `npx playwright install chromium`.
