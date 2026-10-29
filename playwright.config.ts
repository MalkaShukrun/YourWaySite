import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./tests/local-supabase";

// E2E tests (npm run test:e2e): tests/e2e/**/*.spec.ts in a real browser,
// against the app running on the local Supabase (npx supabase start). Each test
// makes its own users and rides, and signs in as them — nothing touches the
// real database.
//
// The app runs on its own port and build folder, so `npm run dev` can stay open.
// Environment variables set here take precedence over .env.local.

const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
const supabase = localSupabase();

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // One dev server serves every browser; more at once and its replies arrive
  // after the 15-second waits.
  workers: 3,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  // The dev server compiles each page on its first visit.
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /\.mobile\.spec\.ts$/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.anonKey,
      SITE_URL: BASE_URL,
      // The contact form must never email the real support inbox from a test.
      RESEND_API_KEY: "e2e-disabled",
      CONTACT_TO_EMAIL: "e2e@example.test",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
