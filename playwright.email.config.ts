import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import base, { BASE_URL } from "./playwright.config";

// The full daily email (npm run test:email:e2e): tests/email/*.spec.ts, on the
// local Supabase like the e2e tests, but it sends a real email through Gmail with
// GMAIL_USER and GMAIL_APP_PASSWORD from .env.local. Kept out of the e2e run.
// Also runs the real Edge Function, which needs its secrets in a file.

process.loadEnvFile(".env.local");

export const CRON_SECRET = "email-e2e-local";
const functionEnv = "tests/email/.env.function"; // Ignored by git, like .env.local.

// A filtered network (NetFree) re-signs TLS. This machine trusts it through
// NODE_EXTRA_CA_CERTS, but the function's Docker container doesn't.
const extraCa = process.env.NODE_EXTRA_CA_CERTS;

writeFileSync(functionEnv, [
  ...(extraCa ? [`GMAIL_TLS_CA=${readFileSync(extraCa).toString("base64")}`] : []),
  `CRON_SECRET=${CRON_SECRET}`,
  `GMAIL_USER=${process.env.GMAIL_USER}`,
  `GMAIL_APP_PASSWORD=${process.env.GMAIL_APP_PASSWORD}`,
  `SITE_URL=${BASE_URL}`,
].join("\n"));

export default defineConfig({
  ...base,
  testDir: "tests/email",
  testMatch: /\.spec\.ts$/, // The .test.ts files there are vitest's.
  workers: 1,
  timeout: 180_000,
  projects: [base.projects![0]],
  webServer: [
    base.webServer as NonNullable<Extract<typeof base.webServer, { command: string }>>,
    {
      command: `npx supabase functions serve daily-passenger-email --no-verify-jwt --env-file ${functionEnv}`,
      // Not a url: the local stack already answers there, with no secrets.
      wait: { stdout: /Serving functions on/ },
      timeout: 120_000,
    },
  ],
});
