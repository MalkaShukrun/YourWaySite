import "server-only";
import { createClient } from "@supabase/supabase-js";

// Supabase client with the secret key: it bypasses RLS and can manage users.
// Only for creating approved users and making their sign-in codes; everything
// else goes through lib/supabase/server.ts. Null when the key isn't set.
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    console.error("createAdminClient: SUPABASE_SECRET_KEY is not set");
    return null;
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
