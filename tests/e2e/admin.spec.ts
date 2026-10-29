import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import type { Seed } from "../integration/support/seed";
import { israelDate, toast } from "./support/ui";

// Group management (spec H1–H3).

const groupRow = (page: Page, label: string) => page.locator(".group-row").filter({ hasText: label });
const newName = (seed: Seed) => `E2E ${seed.tag} ${Math.random().toString(36).slice(2, 6)}`;

// Removes, after the test, the groups this spec created through the page.
async function cleanUpGroups(seed: Seed, origins: string[]) {
  await seed.service.from("ride_groups").delete().in("origin", origins);
}

async function openCreate(page: Page) {
  await page.getByRole("button", { name: "קבוצה חדשה" }).click();
  return page.getByRole("dialog", { name: "יצירת קבוצת נסיעה" });
}

test.describe("creating (spec H1)", () => {
  test("creates a group, which becomes a choice for drivers and passengers", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    try {
      const dialog = await openCreate(page);
      await expect(dialog.getByLabel("נקודת מוצא")).toBeFocused();
      await dialog.getByLabel("נקודת מוצא").fill(origin);
      await dialog.getByLabel("יעד").fill("ירושלים");
      await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();

      await expect(toast(page, "הקבוצה נוצרה בהצלחה")).toBeVisible();
      await expect(dialog).toHaveCount(0);
      const row = groupRow(page, `${origin} ← ירושלים`);
      await expect(row.locator(".status-pill")).toHaveText("פעילה");
      await expect(row).toContainText("אין מסלולים פעילים");

      // Passengers can now pick it in the search filter.
      await page.goto("/");
      await page.getByRole("combobox", { name: "מסלול", exact: true }).click();
      await expect(page.getByRole("listbox", { name: "מסלול" }).getByRole("option", { name: `${origin} ← ירושלים` })).toBeVisible();
    } finally {
      await cleanUpGroups(seed, [origin]);
    }
  });

  test("checks the names, and refuses a duplicate", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await seed.group({ origin, destination: "ירושלים" });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const dialog = await openCreate(page);

    await dialog.getByLabel("נקודת מוצא").fill("ירושלים");
    await dialog.getByLabel("יעד").fill("ירושלים");
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();
    await expect(dialog.getByText("היעד חייב להיות שונה מנקודת המוצא")).toBeVisible();

    await dialog.getByLabel("יעד").fill("א");
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();
    await expect(dialog.getByText("לפחות 2 תווים")).toBeVisible();

    await dialog.getByLabel("נקודת מוצא").fill(origin);
    await dialog.getByLabel("יעד").fill("ירושלים");
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("הקבוצה הזו כבר קיימת.");
    await expect(groupRow(page, `${origin} ← ירושלים`)).toHaveCount(1);
  });

  test("closing the dialog saves nothing", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const dialog = await openCreate(page);
    await dialog.getByLabel("נקודת מוצא").fill(newName(seed));
    await dialog.getByRole("button", { name: "סגירה" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("renaming (spec H1)", () => {
  test("a renamed group shows its new name on existing routes and bookings", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    const groupId = await seed.group({ origin, destination: "ירושלים" });
    const date = israelDate(3);
    const route = await seed.route(await seed.user("Driver"), { groupId, date });
    const passenger = await seed.user("Passenger");
    await seed.book(passenger, route, date);
    await signIn(page, await seed.user("Admin", { admin: true }));

    await page.goto("/admin/groups");
    await groupRow(page, `${origin} ← ירושלים`).getByRole("button", { name: "עריכה" }).click();
    const dialog = page.getByRole("dialog", { name: "עריכת קבוצת נסיעה" });
    await expect(dialog.getByLabel("נקודת מוצא")).toHaveValue(origin);
    await dialog.getByLabel("יעד").fill("הר חוצבים");
    await dialog.getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(toast(page, "הקבוצה עודכנה")).toBeVisible();

    await signIn(page, passenger);
    await page.goto("/my-rides");
    await expect(page.locator(".activity-row")).toContainText(`${origin} ← הר חוצבים`);
  });
});

test.describe("hiding (spec H2)", () => {
  test("a hidden group leaves search but its routes keep running for the driver", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    const groupId = await seed.group({ origin, destination: "ירושלים" });
    const date = israelDate(3);
    const driver = await seed.user("Driver");
    await seed.route(driver, { groupId, date });
    await signIn(page, await seed.user("Admin", { admin: true }));

    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ירושלים`);
    await row.getByRole("button", { name: "הסתרה" }).click();
    await expect(row.locator(".status-pill")).toHaveText("מוסתרת");

    await page.goto(`/?group=${groupId}`);
    await expect(page.getByText("לא נמצאו נסיעות מתאימות")).toBeVisible();

    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    await expect(page.locator(".today-card").filter({ hasText: origin })).toHaveCount(1);
    // …but can't pick it for a new route.
    await page.goto("/routes/new");
    await page.getByRole("button", { name: /^קבוצת נסיעה:/ }).click();
    await expect(page.getByRole("listbox", { name: "קבוצת נסיעה" }).getByRole("option", { name: `${origin} ← ירושלים` })).toHaveCount(0);
  });

  test("showing it again brings it back", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await seed.group({ origin, destination: "ירושלים", active: false });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ירושלים`);
    await row.getByRole("button", { name: "הצגה" }).click();
    await expect(row.locator(".status-pill")).toHaveText("פעילה");
  });
});

test.describe("deleting (spec H3)", () => {
  test("an unused group is deleted after confirming", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    await seed.group({ origin, destination: "ירושלים" });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ירושלים`);

    await row.getByRole("button", { name: "מחיקה" }).click();
    await expect(row.getByText("למחוק את הקבוצה?")).toBeVisible();
    await row.getByRole("button", { name: "כן, למחוק" }).click();
    await expect(row).toHaveCount(0);
  });

  test("a group a route used can only be hidden", async ({ page, seed, signIn }) => {
    const origin = newName(seed);
    const groupId = await seed.group({ origin, destination: "ירושלים" });
    await seed.route(await seed.user("Driver"), { groupId, isActive: false });
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/admin/groups");
    const row = groupRow(page, `${origin} ← ירושלים`);
    await expect(row.getByRole("button", { name: "הסתרה" })).toBeVisible();
    await expect(row.getByRole("button", { name: "מחיקה" })).toHaveCount(0);
  });
});

test("shows the totals and the group list", async ({ page, seed, signIn }) => {
  await signIn(page, await seed.user("Admin", { admin: true }));
  await page.goto("/admin/groups");
  for (const label of ["קבוצות פעילות", "נהגות עם מסלולים", "מסלולים פעילים"]) {
    await expect(page.locator(".stat-card").filter({ hasText: label })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "כל הקבוצות" })).toBeVisible();
});
