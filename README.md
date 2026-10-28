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
   keeps it on with sign-ups disabled, because the RLS tests sign in test users with a password.
4. **Redirect URLs** — *Authentication → URL Configuration*: add `http://localhost:3000/auth/callback`.
5. **Env** — copy `.env.example` to `.env.local` and fill in the URL and publishable key
   (*Project Settings → API*). In production also set `SITE_URL` to the site's public address
   (e.g. `https://yourway.onrender.com`): redirects use it, never the request's Host headers.
   The secret key for e2e tests goes in `.env.e2e.local`, which the app never loads.
6. Run:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — you'll be sent to `/login`.

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
