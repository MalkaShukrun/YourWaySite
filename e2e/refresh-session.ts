// Runs once before the tests (globalSetup). Supabase's access token lasts an
// hour, and its refresh token can be used only once. If every test refreshed
// the saved session on its own, the parallel refreshes would reuse one
// token and Supabase would revoke the session. So it's refreshed here, once,
// and the new cookies are saved back for all the tests to share.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import type { FullConfig } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";
type Cookie = { name: string; value: string; expires: number } & Record<string, unknown>;
const isSessionCookie = (name: string) => /^sb-.+-auth-token(\.\d+)?$/.test(name);

export default async function refreshSession(_config: FullConfig) {
  if (!existsSync(AUTH_FILE)) return;
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Variables may come from the shell instead.
  }

  const state = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as { cookies: Cookie[]; origins: unknown[] };
  const fresh: { name: string; value: string; options?: { maxAge?: number } }[] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => state.cookies.filter((c) => isSessionCookie(c.name)).map(({ name, value }) => ({ name, value })),
      setAll: (toSet) => {
        fresh.push(...toSet);
      },
    },
  });

  const { error } = await supabase.auth.refreshSession();
  if (error || fresh.length === 0) {
    const login = process.env.SUPABASE_SECRET_KEY ? "npm run test:e2e:login" : "npm run test:e2e:login:google";
    throw new Error(`The saved test session has expired (${error?.message ?? "no session"}). Sign in again: ${login}`);
  }

  const now = Math.floor(Date.now() / 1000);
  state.cookies = [
    ...state.cookies.filter((c) => !isSessionCookie(c.name)),
    ...fresh
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
  ];
  writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2));
}
