// npm run test:e2e:login — saves a Google sign-in for the signed-in e2e tests.
//
// Google refuses to sign in inside a browser Playwright launches, so this
// opens a plain Chrome window (its own profile, so your everyday Chrome is
// untouched). You sign in there; only after you're in the app does Playwright
// attach to copy the session. Re-run when the session expires.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";
const APP = "http://localhost:3000";
const PORT = 9222;
const CHROME = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((path) => path && existsSync(path));

if (!CHROME) {
  console.error("Chrome not found — set CHROME_PATH to chrome.exe.");
  process.exit(1);
}

const chrome = spawn(
  CHROME,
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${resolve("e2e/.auth/chrome-profile")}`, "--no-first-run", `${APP}/login`],
  { stdio: "ignore" },
);

console.log("Sign in with Google in the Chrome window that just opened.");
console.log("Waiting until you're inside the app (up to 5 minutes)…");

// Watch the open tabs over plain HTTP — nothing is attached to the page while
// you're on Google's sign-in screens.
async function signedInTab() {
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return tabs.some((t) => t.type === "page" && t.url.startsWith(APP) && !new URL(t.url).pathname.startsWith("/login"));
  } catch {
    return false; // Chrome still starting
  }
}

const deadline = Date.now() + 5 * 60_000;
while (!(await signedInTab())) {
  if (Date.now() > deadline || chrome.exitCode !== null) {
    console.error("Didn't see a signed-in page — nothing saved.");
    chrome.kill();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
mkdirSync(dirname(AUTH_FILE), { recursive: true });
await browser.contexts()[0].storageState({ path: AUTH_FILE });
await browser.close();
chrome.kill();

console.log(`Saved to ${AUTH_FILE}. Now run: npm run test:e2e`);
