import { expect, test } from "./support/fixtures";
import { bottomNav } from "./support/ui";

// On phones the menu becomes a bottom tab bar with short labels (spec §1 Modes, A4).

test("the bottom bar reaches every passenger page", async ({ page, seed, signIn }) => {
  await signIn(page, await seed.user("Passenger"));
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

test("driver mode shows the driver tabs, with groups only for admins", async ({ page, seed, signIn }) => {
  await signIn(page, await seed.user("Driver"));
  await page.goto("/dashboard");
  const bar = bottomNav(page);
  await expect(bar.getByRole("link", { name: "השבוע" })).toBeVisible();
  await bar.getByRole("link", { name: "מסלולים" }).click();
  await expect(page).toHaveURL(/\/routes$/);
  await expect(bar.getByRole("link", { name: "קבוצות" })).toHaveCount(0);

  await signIn(page, await seed.user("Admin", { admin: true }));
  await page.goto("/dashboard");
  await expect(bottomNav(page).getByRole("link", { name: "קבוצות" })).toBeVisible();
});

test("no page scrolls sideways", async ({ page, seed, signIn }) => {
  const driver = await seed.user("Driver");
  const route = await seed.route(driver);
  const { data } = await seed.service.from("routes").select("ride_date").eq("id", route.id).single();
  await signIn(page, driver);
  for (const path of ["/", "/my-rides", "/payments", "/dashboard", "/routes", "/routes/new", "/profile", `/ride/${route.id}?date=${data!.ride_date}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
