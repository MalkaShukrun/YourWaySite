import { expect, test } from "@playwright/test";
import { bottomNav, hideDevTools, isAdmin } from "./helpers";

test.beforeEach(({ page }) => hideDevTools(page));

// Phone layout: the bottom tab bar replaces the side menu.

test("the bottom bar reaches every passenger page", async ({ page }) => {
  await page.goto("/");
  const bar = bottomNav(page);
  await expect(bar).toBeVisible();
  await expect(page.locator(".sidebar").filter({ visible: true })).toHaveCount(0);

  for (const [name, url] of [["נסיעות", /\/my-rides$/], ["תשלומים", /\/payments$/], ["פרופיל", /\/profile$/], ["חיפוש", /\/$/]] as const) {
    await bar.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url);
    await expect(bar.getByRole("link", { name })).toHaveClass(/active/);
  }
});

test("driver mode shows the driver tabs, with groups only for admins", async ({ page }) => {
  const admin = await isAdmin(page);
  await page.goto("/dashboard");
  const bar = bottomNav(page);

  await expect(bar.getByRole("link", { name: "היום" })).toBeVisible();
  await bar.getByRole("link", { name: "מסלולים" }).click();
  await expect(page).toHaveURL(/\/routes$/);
  await expect(bar.getByRole("link", { name: "קבוצות" })).toHaveCount(admin ? 1 : 0);
});

test("no page scrolls sideways", async ({ page }) => {
  for (const path of ["/", "/my-rides", "/payments", "/dashboard", "/routes", "/routes/new", "/profile"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
