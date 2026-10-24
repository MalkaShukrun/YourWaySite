# YourWay (בדרך שלך)

Ride-sharing and group transportation app. Next.js (App Router) + Supabase.

## Setup

1. **Supabase project** — create one at https://supabase.com.
2. **Database** — open *SQL Editor*, paste the whole of `supabase/setup.sql` and run it
   (it combines `supabase/migrations/0001–0003`; safe to run again). Optional demo rides: `supabase/seed_demo.sql`.
3. **Google login** — *Authentication → Sign In / Providers → Google*: enable it and paste the
   Client ID / Secret from Google Cloud Console (OAuth client, type "Web application").
   In Google Cloud, add the redirect URI shown by Supabase (`https://<project>.supabase.co/auth/v1/callback`).
   You can turn the **Email** provider off — the app only signs in with Google.
4. **Redirect URLs** — *Authentication → URL Configuration*: add `http://localhost:3000/auth/callback`.
5. **Env** — copy `.env.example` to `.env.local` and fill in the URL and publishable key
   (*Project Settings → API*).
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

To make someone an admin, run in the SQL editor (after they've logged in once):

```sql
update public.profiles set is_admin = true where email = 'someone@gmail.com';
```

Users can't change their own `is_admin` flag (enforced by column grants + RLS).
