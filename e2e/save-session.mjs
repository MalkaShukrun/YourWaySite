// npm run test:e2e:login — signs the e2e tests in as a user without Google.
//
// Uses the Supabase secret key (SUPABASE_SECRET_KEY in .env.local) to mint a
// one-time magic-link token for E2E_EMAIL, redeems it right here, and saves
// the resulting session cookies for Playwright. No email is sent. Local only:
// the secret key must never be exposed to the app or committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const AUTH_FILE = "e2e/.auth/user.json";
const EMAIL = process.env.E2E_EMAIL ?? "malkycohen1@gmail.com";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may come from the shell instead.
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error(
    "Missing SUPABASE_SECRET_KEY (or the public Supabase variables) in .env.local.\n" +
      "Copy it from Supabase → Project Settings → API Keys → Secret keys.",
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkError) {
  console.error(`Couldn't create a sign-in link for ${EMAIL}: ${linkError.message}`);
  process.exit(1);
}

// Redeem the token through the same SSR client the app uses, so the cookies
// come out in exactly the format the proxy and server components read.
const cookies = [];
const ssr = createServerClient(url, publishableKey, {
  cookies: {
    getAll: () => [],
    setAll: (toSet) => cookies.push(...toSet),
  },
});
const { error: verifyError } = await ssr.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (verifyError || cookies.length === 0) {
  console.error(`Couldn't sign in as ${EMAIL}: ${verifyError?.message ?? "no session returned"}`);
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const state = {
  cookies: cookies
    .filter(({ value }) => value)
    .map(({ name, value, options }) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      expires: options?.maxAge ? now + options.maxAge : -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    })),
  origins: [],
};

mkdirSync(dirname(AUTH_FILE), { recursive: true });
writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2));
console.log(`Signed in as ${EMAIL} — saved to ${AUTH_FILE}. Now run: npm run test:e2e`);
