import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { io } from "next/cache";

// Supabase client for Server Components, Server Actions and Route Handlers.
// Reads cookies, so it must only be used at request time (behind <Suspense>).
export async function createClient() {
  // supabase-js checks the session's expiry with Date.now() on every query;
  // io() keeps those clock reads out of Next's prerendered shell.
  await io();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The proxy refreshes the session, so this can be ignored.
          }
        },
      },
    },
  );
}
