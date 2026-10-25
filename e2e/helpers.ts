import { expect, type Page } from "@playwright/test";

// Today in Israel as "YYYY-MM-DD" — the app's server clock.
export function israelToday(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(date);
}

// The next date (from tomorrow) that isn't Saturday — recurring routes run Sunday–Friday.
export function nextWeekday() {
  for (let i = 1; ; i++) {
    const day = israelToday(i);
    if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 6) return day;
  }
}

// The app's own <Select>: open it by its label, then pick an option.
export async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  await page.getByRole("listbox", { name: label }).getByRole("option", { name: option }).click();
}

// Options of a <Select>, read by opening and closing it.
export async function optionsOf(page: Page, label: string) {
  const trigger = page.getByRole("button", { name: new RegExp(`^${label}:`) });
  await trigger.click();
  const options = await page.getByRole("listbox", { name: label }).getByRole("option").allInnerTexts();
  await trigger.click();
  return options.map((o) => o.trim());
}

export async function isAdmin(page: Page) {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "הפרופיל שלי" })).toBeVisible();
  return (await page.locator('.side-nav a[href="/admin/groups"]').count()) > 0;
}

// Fails the test on uncaught page errors.
export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

// Next renders notFound() as its 404 page.
export async function expectNotFound(page: Page) {
  await expect(page.getByText(/404|could not be found/i).first()).toBeVisible();
}

// Next 16 keeps the previous layout mounted (hidden) after switching between
// the passenger and driver areas, so there can be two menus — use the visible one.
export const sideNav = (page: Page) => page.locator(".side-nav").filter({ visible: true });
export const bottomNav = (page: Page) => page.locator(".bottom-nav").filter({ visible: true });

// `next dev`'s floating dev-tools button covers the bottom tab bar on phones.
export async function hideDevTools(page: Page) {
  await page.addInitScript(() => {
    const style = () => document.head.append(Object.assign(document.createElement("style"), { textContent: "nextjs-portal{display:none!important}" }));
    if (document.head) style();
    else document.addEventListener("DOMContentLoaded", style);
  });
}

// The app's toast (role=status), by text.
export function toast(page: Page, text: string | RegExp) {
  return page.locator(".toast").filter({ hasText: text });
}
