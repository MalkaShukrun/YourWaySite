import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import type { Seed } from "../integration/support/seed";
import { choose, israelDate, toast } from "./support/ui";

// Group management (spec H1–H3) and its list of places (0040).

const groupRow = (page: Page, label: string) => page.locator(".group-row").filter({ hasText: label });
const placeRow = (page: Page, name: string) => page.locator(".place-row").filter({ hasText: name });
const newCity = (seed: Seed) => `E2E ${seed.tag} ${Math.random().toString(36).slice(2, 6)}`;
const newName = (seed: Seed) => `${newCity(seed)}, מרכז`;
const JERUSALEM = "ירושלים, גבעת שאול";

// Removes, after the test, the groups this spec created through the page.
async function cleanUpGroups(seed: Seed, origins: string[]) {
  await seed.service.from("ride_groups").delete().in("origin", origins);
}

async function openCreate(page: Page) {
  await page.getByRole("button", { name: "קבוצה חדשה" }).click();
  return page.getByRole("dialog", { name: "יצירת קבוצת נסיעה" });
}

test.describe("creating (spec H1)", () => {
  test("creates a group from two places, which becomes a choice for drivers and passengers", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await Promise.all([seed.place(origin), seed.place(JERUSALEM)]);
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    try {
      const dialog = await openCreate(page);
      await choose(page, "נקודת מוצא", origin, dialog);
      await choose(page, "יעד", JERUSALEM, dialog);
      await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();

      await expect(toast(page, "הקבוצה נוצרה בהצלחה")).toBeVisible();
      await expect(dialog).toHaveCount(0);
      const row = groupRow(page, `${origin} ← ${JERUSALEM}`);
      await expect(row.locator(".status-pill")).toHaveText("פעילה");
      await expect(row).toContainText("אין מסלולים פעילים");
      await expect(placeRow(page, origin)).toContainText("קבוצה אחת");

      // Passengers can now pick its places in the search filters.
      await page.goto("/");
      await page.getByRole("combobox", { name: "מאיפה", exact: true }).click();
      await expect(page.getByRole("listbox", { name: "מאיפה" }).getByRole("option", { name: origin, exact: true })).toBeVisible();
    } finally {
      await cleanUpGroups(seed, [origin]);
    }
  });

  test("refuses the same place twice, and a duplicate", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await seed.group({ origin, destination: JERUSALEM });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const dialog = await openCreate(page);

    await choose(page, "נקודת מוצא", JERUSALEM, dialog);
    await choose(page, "יעד", JERUSALEM, dialog);
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();
    await expect(dialog.getByText("היעד חייב להיות שונה מנקודת המוצא")).toBeVisible();

    await choose(page, "נקודת מוצא", origin, dialog);
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("הקבוצה הזו כבר קיימת.");
    await expect(groupRow(page, `${origin} ← ${JERUSALEM}`)).toHaveCount(1);
  });

  test("closing the dialog saves nothing", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const dialog = await openCreate(page);
    await dialog.getByRole("button", { name: "סגירה" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("changing a group (spec H1)", () => {
  test("a group given another place shows it on existing routes and bookings", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    const groupId = await seed.group({ origin, destination: JERUSALEM });
    await seed.place("ירושלים, הר חוצבים");
    const date = israelDate(3);
    const route = await seed.route(await seed.user("Driver"), { groupId, date });
    const passenger = await seed.user("Passenger");
    await seed.book(passenger, route, date);
    await signIn(page, await seed.user("Admin", { admin: true }));

    await page.goto("/admin/groups");
    await groupRow(page, `${origin} ← ${JERUSALEM}`).getByRole("button", { name: "עריכה" }).click();
    const dialog = page.getByRole("dialog", { name: "עריכת קבוצת נסיעה" });
    await expect(dialog.getByRole("combobox", { name: "נקודת מוצא", exact: true })).toHaveValue(origin);
    await choose(page, "יעד", "ירושלים, הר חוצבים", dialog);
    await dialog.getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(toast(page, "הקבוצה עודכנה")).toBeVisible();

    await signIn(page, passenger);
    await page.goto("/my-rides");
    await expect(page.locator(".activity-row")).toContainText(`${origin} ← ירושלים, הר חוצבים`);
  });
});

test.describe("places (0040)", () => {
  test("an admin adds a place, shown under its city",async ({ page, seed, signIn }) => {
    const city = newCity(seed);
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    try {
      await page.getByRole("button", { name: "מקום חדש" }).click();
      const dialog = page.getByRole("dialog", { name: "הוספת מקום" });
      await dialog.getByRole("button", { name: "הוספת המקום" }).click();
      await expect(dialog.getByText("לפחות 2 תווים")).toHaveCount(2);

      await dialog.getByLabel("עיר").fill(city);
      await dialog.getByLabel("שכונה או אזור").fill("רמה ג");
      await dialog.getByRole("button", { name: "הוספת המקום" }).click();
      await expect(toast(page, "המקום נוסף לרשימה")).toBeVisible();

      const cityGroup = page.locator(".place-city-group").filter({ has: page.locator(".place-city-head", { hasText: city }) });
      await expect(cityGroup.locator(".place-city-head")).toContainText("מקום אחד");
      const row = placeRow(page, `${city}, רמה ג`);
      await expect(row.locator(".place-area")).toHaveText("רמה ג");
      await expect(row).toContainText("אין קבוצות");

      // The same place again is refused.
      await page.getByRole("button", { name: "מקום חדש" }).click();
      await dialog.getByLabel("עיר").fill(city);
      await dialog.getByLabel("שכונה או אזור").fill("רמה ג");
      await dialog.getByRole("button", { name: "הוספת המקום" }).click();
      await expect(dialog.getByRole("alert")).toHaveText("המקום הזה כבר ברשימה.");
    } finally {
      await seed.service.from("places").delete().eq("city", city);
    }
  });

  test("renaming a place renames its groups", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await seed.group({ origin, destination: JERUSALEM });
    await signIn(page, await seed.user("Admin", { admin: true }));

    await page.goto("/admin/groups");
    await placeRow(page, origin).getByRole("button", { name: "עריכה" }).click();
    const dialog = page.getByRole("dialog", { name: "עריכת מקום" });
    await dialog.getByLabel("שכונה או אזור").fill("צפון");
    await dialog.getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(toast(page, "המקום עודכן")).toBeVisible();

    const renamed = origin.replace(", מרכז", ", צפון");
    await expect(groupRow(page, `${renamed} ← ${JERUSALEM}`)).toHaveCount(1);
  });

  test("only a place no group uses can be deleted", async ({ page, seed, signIn }) => {
    const used = newName(seed);
    const unused = newName(seed);
    await seed.group({ origin: used, destination: JERUSALEM });
    await seed.place(unused);
    await signIn(page, await seed.user("Admin", { admin: true }));

    await page.goto("/admin/groups");
    await expect(placeRow(page, used).getByRole("button", { name: "מחיקה" })).toHaveCount(0);
    await placeRow(page, unused).getByRole("button", { name: "מחיקה" }).click();
    await page.getByRole("button", { name: "כן, למחוק" }).click();
    await expect(placeRow(page, unused)).toHaveCount(0);
  });

  test("'סגירת הכל' folds every city and 'פתיחת הכל' opens them", async ({ page, seed, signIn }) => {
    const name = newName(seed);
    await seed.place(name);
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const cities = page.locator(".place-city-group");
    await expect(placeRow(page, name)).toBeVisible();

    await page.getByRole("button", { name: "סגירת הכל" }).click();
    await expect(cities.and(page.locator("[open]"))).toHaveCount(0);
    await expect(placeRow(page, name)).toBeHidden();

    await page.getByRole("button", { name: "פתיחת הכל" }).click();
    await expect(cities.and(page.locator(":not([open])"))).toHaveCount(0);
    await expect(placeRow(page, name)).toBeVisible();
  });
});

test.describe("hiding (spec H2)", () => {
  test("a hidden group leaves search but its routes keep running for the driver", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    const groupId = await seed.group({ origin, destination: JERUSALEM });
    const date = israelDate(3);
    const driver = await seed.user("Driver");
    await seed.route(driver, { groupId, date });
    await signIn(page, await seed.user("Admin", { admin: true }));

    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ${JERUSALEM}`);
    await row.getByRole("button", { name: "הסתרה" }).click();
    await expect(row.locator(".status-pill")).toHaveText("מוסתרת");

    await page.goto(`/?group=${groupId}`);
    await expect(page.getByText("לא נמצאו נסיעות מתאימות")).toBeVisible();

    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    await expect(page.locator(".today-card").filter({ hasText: origin })).toHaveCount(1);
    // …but can't pick it for a new route.
    await page.goto("/routes/new");
    await page.getByRole("combobox", { name: "קבוצת נסיעה", exact: true }).click();
    await expect(page.getByRole("listbox", { name: "קבוצת נסיעה" }).getByRole("option", { name: `${origin} ← ${JERUSALEM}` })).toHaveCount(0);
  });

  test("showing it again brings it back", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await seed.group({ origin, destination: JERUSALEM, active: false });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ${JERUSALEM}`);
    await row.getByRole("button", { name: "הצגה" }).click();
    await expect(row.locator(".status-pill")).toHaveText("פעילה");
  });
});

test.describe("deleting (spec H3)", () => {
  test("an unused group is deleted after confirming", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await seed.group({ origin, destination: JERUSALEM });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ${JERUSALEM}`);

    await row.getByRole("button", { name: "מחיקה" }).click();
    await expect(row.getByText("למחוק את הקבוצה?")).toBeVisible();
    await row.getByRole("button", { name: "כן, למחוק" }).click();
    await expect(row).toHaveCount(0);
  });

  test("a group a route used can only be hidden", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    const groupId = await seed.group({ origin, destination: JERUSALEM });
    await seed.route(await seed.user("Driver"), { groupId, isActive: false });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ${JERUSALEM}`);
    await expect(row.getByRole("button", { name: "הסתרה" })).toBeVisible();
    await expect(row.getByRole("button", { name: "מחיקה" })).toHaveCount(0);
  });
});

test("the group list folds away and opens again", async ({ page, seed, signIn }) => {
  const origin = newName(seed);
  await seed.group({ origin, destination: JERUSALEM });
  await signIn(page, await seed.user("Admin", { admin: true }));
  await page.goto("/admin/groups");
  const row = groupRow(page, `${origin} ← ${JERUSALEM}`);
  const toggle = page.getByRole("button", { name: "כל הקבוצות" });
  await expect(row).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(row).toBeHidden();

  // "קבוצה חדשה" sits on the title row; it opens its dialog, not the list.
  const dialog = await openCreate(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "סגירה" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await page.locator(".panel-title-toggle", { hasText: "כל הקבוצות" }).click();
  await expect(row).toBeVisible();
});

test("the personal code list folds away and opens again", async ({ page, seed, signIn }) => {
  await signIn(page, await seed.user("Admin", { admin: true }));
  await page.goto("/admin/groups");
  const input = page.getByPlaceholder("name@example.com");
  const toggle = page.getByRole("button", { name: "כניסה עם קוד אישי" });
  await expect(input).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(input).toBeHidden();

  await page.locator(".panel-title-toggle", { hasText: "כניסה עם קוד אישי" }).click();
  await expect(input).toBeVisible();
});

// Active as in the driver's active tab (spec H5): one-time rides that took
// place or were cancelled for their date aren't counted.
test("a group's active routes leave out past and cancelled one-time rides", async ({ page, seed, signIn }) => {
  const origin = newName(seed);
  const groupId = await seed.group({ origin, destination: JERUSALEM });
  const driver = await seed.user("Driver");
  const date = israelDate(3);
  await seed.route(driver, { groupId, date });
  await seed.route(driver, { groupId, date: israelDate(-1) });
  const cancelled = await seed.route(driver, { groupId, date });
  await seed.service.from("ride_exceptions").insert({ route_id: cancelled.id, ride_date: date, cancelled: true });
  await signIn(page, await seed.user("Admin", { admin: true }));

  await page.goto("/admin/groups");
  await expect(groupRow(page, `${origin} ← ${JERUSALEM}`)).toContainText("מסלול פעיל אחד");
});

test("shows the totals and the group list", async ({ page, seed, signIn }) => {
  await signIn(page, await seed.user("Admin", { admin: true }));
  await page.goto("/admin/groups");
  for (const label of [
    "טרמפיסטיות נוסעות היום",
    "נסיעות יוצאות היום",
    "משתמשות במערכת",
    "נסיעות שיצאו עם טרמפיסטיות",
    "טרמפיסטיות שנסעו עד היום",
    "קבוצות פעילות",
    "נהגות עם מסלולים",
    "מסלולים פעילים",
  ]) {
    await expect(page.locator(".stat-card").filter({ hasText: label })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "כל הקבוצות" })).toBeVisible();
});
