import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { daysFromToday } from "../integration/support/seed";
import { hebrewName as name } from "./support/ui";

// Smart search (spec C8, components/passenger/SmartSearch.tsx): a free-text
// box above the filters that fills them from a Hebrew sentence. The rules
// themselves are covered by tests/unit/lib/smart-search; this checks the page.

const box = (page: Page) => page.getByRole("combobox", { name: "חיפוש חכם: מאיפה, לאן ומתי" });
const clearBox = (page: Page) => page.getByRole("button", { name: "ניקוי החיפוש" });
// The arrow in the box: runs the search her sentence describes.
const arrow = (page: Page) => page.getByRole("button", { name: "חיפוש לפי מה שכתבת" });
// "מאיפה" / "לאן" are text boxes that show the picked place; the others are buttons.
const place = (page: Page, label: string) => page.getByRole("combobox", { name: label, exact: true });
const filter = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^${label}:`) });
// A filter's box with its label: green (.smart-filled) when smart search filled it.
// Its label then also says so to screen readers, so match the label's start.
const filterField = (page: Page, label: string) => page.locator(".filters .field").filter({ hasText: new RegExp(`^${label}`) });

// Types once React runs the box: its X shows only then.
async function type(page: Page, text: string) {
  await expect(async () => {
    await box(page).fill(text);
    await expect(clearBox(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test("fills the filters while typing; the arrow, or Enter, runs the search", async ({ page, seed, signIn }) => {
  const [from, to] = [name(), name()];
  const driver = await seed.user("Driver", { fullName: "דנה נהגת" });
  const groupId = await seed.group({ origin: `${from}, מרכז`, destination: `${to}, מרכז` });
  await seed.route(driver, { groupId, date: daysFromToday(1), time: "08:00" });
  await signIn(page, await seed.user("Passenger"));

  await page.goto("/");
  await type(page, `מ${from} ל${to} מחר בבוקר עד 9, חד פעמית`);
  await expect(place(page, "מאיפה")).toHaveValue(`${from} (כל העיר)`);
  await expect(place(page, "לאן")).toHaveValue(`${to} (כל העיר)`);
  await expect(filter(page, "יציאה משעה")).toContainText("06:00");
  await expect(filter(page, "עד שעה")).toContainText("09:00");
  await expect(page.getByRole("combobox", { name: "סוג נסיעה" })).toHaveValue("נסיעות חד־פעמיות");
  // Each filled filter is marked as filled by smart search.
  for (const label of ["מאיפה", "לאן", "תאריך", "יציאה משעה", "עד שעה", "סוג נסיעה"]) {
    await expect(filterField(page, label)).toHaveClass(/smart-filled/);
  }

  // Filling isn't searching: the results wait for the arrow.
  await expect(page).toHaveURL(/\/$/);
  await arrow(page).click();
  await expect(page).toHaveURL(new RegExp(`origin=city%3A.+&destination=city%3A.+&date=${daysFromToday(1)}&from=06%3A00&to=09%3A00&kind=one_time$`));
  await expect(page.locator(".trip-card").filter({ hasText: from })).toContainText("08:00");
  // Enter does the same, and changes nothing more.
  const url = page.url();
  await box(page).press("Enter");
  await page.waitForLoadState("networkidle");
  expect(page.url()).toBe(url);

  // Changing a filter by hand makes it hers: no longer marked. The others stay.
  await page.getByRole("button", { name: "החלפת כיוון" }).click();
  await expect(filterField(page, "מאיפה")).not.toHaveClass(/smart-filled/);
  await expect(filterField(page, "לאן")).not.toHaveClass(/smart-filled/);
  await expect(filterField(page, "תאריך")).toHaveClass(/smart-filled/);

  // The X empties the box and the filters; the results stay until she searches.
  await clearBox(page).click();
  await expect(box(page)).toHaveValue("");
  await expect(page).toHaveURL(url);
  await expect(arrow(page)).toBeDisabled();
  await expect(place(page, "מאיפה")).toHaveValue("מכל מקום");
  await expect(page.locator(".filters .smart-filled")).toHaveCount(0);
});

test("asks which place she meant when a neighborhood is in two cities", async ({ page, seed, signIn }) => {
  const [area, cityA, cityB, to] = [name(), name(), name(), name()];
  const driver = await seed.user("Driver");
  const groupA = await seed.group({ origin: `${cityA}, ${area}`, destination: `${to}, מרכז` });
  await seed.group({ origin: `${cityB}, ${area}`, destination: `${to}, מרכז` });
  await seed.route(driver, { groupId: groupA, date: daysFromToday(2) });
  await signIn(page, await seed.user("Passenger"));

  await page.goto("/");
  await type(page, `מ${area} ל${to}`);
  const choices = page.locator(".smart-search-choices");
  await expect(choices).toContainText("התכוונת ל…?");
  await expect(choices.getByRole("button")).toHaveCount(2);
  await expect(choices.getByRole("button", { name: `${cityB}, ${area}` })).toBeVisible();

  // The pick fills "מאיפה"; the arrow runs it.
  await choices.getByRole("button", { name: `${cityA}, ${area}` }).click();
  await expect(page).toHaveURL(/\/$/);
  await arrow(page).click();
  await expect(page).toHaveURL(/\?origin=[0-9a-f-]{36}&destination=city%3A/);
  const picked = page.url();
  await expect(choices).toHaveCount(0);
  await expect(page.locator(".trip-card").filter({ hasText: cityA })).toHaveCount(1);

  // Her pick stays when she searches the same sentence again: no question
  // again, and once the search has loaded, the same address.
  await box(page).press("Enter");
  await page.waitForLoadState("networkidle");
  await expect(choices).toHaveCount(0);
  expect(page.url()).toBe(picked);
});

test("leaves the filters alone when it finds nothing it knows", async ({ page, seed, signIn }) => {
  await signIn(page, await seed.user("Passenger"));
  await page.goto("/");
  await type(page, "שלום מה נשמע");
  await box(page).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".smart-search-choices")).toHaveCount(0);
});
