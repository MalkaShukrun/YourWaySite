import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// A saved session (npm run test:e2e:login). Without it only the
// signed-out tests run.
export const AUTH_FILE = "e2e/.auth/user.json";
const signedIn = existsSync(AUTH_FILE);
// Tests that save data run only when asked (npm run test:e2e:write).
const write = Boolean(process.env.E2E_WRITE);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "signed-out", testMatch: /public\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /public\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    ...(signedIn
      ? [
          { name: "signed-in", testMatch: /signed-in\.spec\.ts/, use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE } },
          { name: "signed-in-mobile", testMatch: /signed-in-mobile\.spec\.ts/, use: { ...devices["Pixel 7"], storageState: AUTH_FILE } },
        ]
      : []),
    ...(signedIn && write
      ? [{ name: "write", testMatch: /write\.spec\.ts/, fullyParallel: false, use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE } }]
      : []),
  ],
  // Reuses `npm run dev` if it's already running.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
