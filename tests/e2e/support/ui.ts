import { expect, type Locator, type Page } from "@playwright/test";

// Ways to work the app's own controls, shared by the specs.

// The trigger of the app's <Select>: a button named "label: value", or the
// text box of a searchable one.
function selectTrigger(page: Page | Locator, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}:`) }).or(page.getByRole("combobox", { name: label, exact: true }));
}

// Opens a <Select> by its label and picks an option.
export async function choose(page: Page, label: string, option: string | RegExp, scope: Page | Locator = page) {
  await selectTrigger(scope, label).click();
  await page.getByRole("listbox", { name: label }).getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

// The options of a <Select>, read by opening and closing it.
export async function optionsOf(page: Page, label: string) {
  await selectTrigger(page, label).click();
  const options = await page.getByRole("listbox", { name: label }).getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  return options.map((o) => o.trim());
}

// Picks "HH:MM" in a <TimePicker> (minutes in 5-minute steps).
export async function chooseTime(page: Page, label: string, time: string) {
  const [hour, minute] = time.split(":");
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  const panel = page.getByRole("dialog", { name: label });
  await panel.getByRole("listbox", { name: "שעה" }).getByRole("option", { name: hour, exact: true }).click();
  await panel.getByRole("listbox", { name: "דקות" }).getByRole("option", { name: minute, exact: true }).click();
}

// Opens a page with a form and waits until its submit button is enabled: the
// form enables it once React has taken over the page. Typing earlier can be
// undone by hydration.
export async function openForm(page: Page, path: string, submit: string) {
  await page.goto(path);
  await expect(page.getByRole("button", { name: submit })).toBeEnabled();
}

// The app's toast, by its text.
export const toast = (page: Page, text: string | RegExp) => page.locator(".toast").filter({ hasText: text });

// Next can keep the other mode's layout mounted (hidden), so use the visible menu.
export const sideNav = (page: Page) => page.locator(".side-nav").filter({ visible: true });
export const bottomNav = (page: Page) => page.locator(".bottom-nav").filter({ visible: true });

export async function expectNotFound(page: Page) {
  await expect(page.getByText("הדף לא נמצא").first()).toBeVisible();
}

// Collects uncaught errors on the page.
export function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

// ─── Dates, in Israel time like the app ──────────────────────────────────────

export function israelDate(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

// How the app writes a date on chips: "ד׳ 4.11".
export function shortDate(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return `${["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"][d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}
