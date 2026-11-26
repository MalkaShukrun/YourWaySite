import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { israelDate, toast } from "./support/ui";
import type { Seed } from "../integration/support/seed";

// Ride alerts (spec C10, C11): asking to hear about a ride from a search with
// no results or from a full ride's card, and "ההתראות שלי" in the passenger menu.

const alertRows = (page: Page) => page.locator(".alert-row");
const ALERT_BUTTON = "עדכנו אותי"; // the empty results' button; a card's is named in full
const CARD_ALERT_BUTTON = "עדכנו אותי כשיתפנה מקום";

// The places of a new group, as search picks them.
async function groupPicks(seed: Seed) {
  const groupId = await seed.group();
  const { data } = await seed.service.from("ride_groups").select("origin_place_id, destination_place_id").eq("id", groupId).single();
  return { groupId, origin: data!.origin_place_id as string, destination: data!.destination_place_id as string };
}

test.describe("ride alerts", () => {
  test("saves an alert from a search with no results, filled from the search (spec C10)", async ({ page, seed, signIn }) => {
    const { origin, destination } = await groupPicks(seed);
    const passenger = await seed.user("Passenger");
    await signIn(page, passenger);
    const date = israelDate(3);

    await page.goto(`/?origin=${origin}&destination=${destination}&date=${date}&from=07:00&to=09:00`);
    await expect(page.getByText("לא נמצאו נסיעות מתאימות")).toBeVisible();
    await page.getByRole("button", { name: ALERT_BUTTON, exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "התראה על נסיעה" });
    await expect(dialog.getByRole("button", { name: /יציאה משעה: 07:00/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /עד שעה: 09:00/ })).toBeVisible();
    await dialog.getByRole("button", { name: "שמירה" }).click();

    const saved = page.getByRole("status").filter({ hasText: "ההתראה נשמרה" });
    await expect(saved).toBeVisible();
    await expect(saved).toContainText("ההתראה נשמרה, להתראות שלי");
    await expect(saved).toContainText("נשלח לך מייל כשתפורסם נסיעה מתאימה או יתפנה בה מקום.");
    const { data } = await seed.service.from("ride_alerts").select("*").eq("passenger_id", passenger.id);
    expect(data).toEqual([
      expect.objectContaining({
        origins: [origin],
        destinations: [destination],
        start_date: date,
        end_date: date,
        from_time: "07:00:00",
        until_time: "09:00:00",
      }),
    ]);

    // The link leads to her alerts, with the new one listed.
    await saved.getByRole("link", { name: "להתראות שלי" }).click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(alertRows(page)).toHaveCount(1);
  });

  test("saves an alert from a full ride's card, filled from the card", async ({ page, seed, signIn }) => {
    const { groupId, origin, destination } = await groupPicks(seed);
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const full = await seed.route(driver, { groupId, date, seats: 1 });
    await seed.book(await seed.user("Other"), full, date);
    await seed.route(driver, { groupId, date, time: "12:00" }); // with a free seat
    const passenger = await seed.user("Passenger");
    await signIn(page, passenger);

    await page.goto(`/?origin=${origin}&destination=${destination}`);
    await expect(page.locator(".trip-card")).toHaveCount(2);
    // On the full card only, and no strip above the results.
    await expect(page.getByRole("button", { name: CARD_ALERT_BUTTON })).toHaveCount(1);
    await expect(page.getByRole("button", { name: ALERT_BUTTON, exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: CARD_ALERT_BUTTON }).click();
    const dialog = page.getByRole("dialog", { name: "התראה על נסיעה" });
    await dialog.getByRole("button", { name: "שמירה" }).click();

    const saved = page.locator(".trip-card").getByRole("status").filter({ hasText: "ההתראה נשמרה" });
    await expect(saved).toBeVisible();
    // Compact on a card: the check and the link, without the email line.
    await expect(saved.getByRole("link", { name: "להתראות שלי" })).toHaveAttribute("href", "/alerts");
    await expect(saved).not.toContainText("נשלח לך מייל");
    const { data } = await seed.service.from("ride_alerts").select("*").eq("passenger_id", passenger.id);
    expect(data).toEqual([
      expect.objectContaining({
        origins: [origin],
        destinations: [destination],
        start_date: date,
        end_date: date,
        from_time: null,
        until_time: null,
      }),
    ]);
  });

  test("doesn't offer an alert when a seat is free", async ({ page, seed, signIn }) => {
    const { groupId, origin, destination } = await groupPicks(seed);
    const driver = await seed.user("Driver");
    await seed.route(driver, { groupId, date: israelDate(3) });
    const passenger = await seed.user("Passenger");
    await signIn(page, passenger);

    await page.goto(`/?origin=${origin}&destination=${destination}`);
    await expect(page.locator(".trip-card")).toHaveCount(1);
    await expect(page.getByRole("button", { name: ALERT_BUTTON, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: CARD_ALERT_BUTTON })).toHaveCount(0);
  });

  test("doesn't offer an alert when the only ride found is her own, with seats free", async ({ page, seed, signIn }) => {
    const { groupId, origin, destination } = await groupPicks(seed);
    const driver = await seed.user("Driver");
    await seed.route(driver, { groupId, date: israelDate(3) });
    await signIn(page, driver);

    await page.goto(`/?origin=${origin}&destination=${destination}`);
    await expect(page.locator(".trip-card")).toHaveCount(1);
    await expect(page.getByRole("button", { name: ALERT_BUTTON, exact: true })).toHaveCount(0);
  });

  test("shows the limit of 3 alerts", async ({ page, seed, signIn }) => {
    const { origin, destination } = await groupPicks(seed);
    const passenger = await seed.user("Passenger");
    for (const time of ["06:00", "07:00", "08:00"]) {
      await passenger.db.rpc("create_ride_alert", { p_origins: [origin], p_destinations: [destination], p_from_time: time });
    }
    await signIn(page, passenger);

    await page.goto(`/?origin=${origin}&destination=${destination}`);
    await page.getByRole("button", { name: ALERT_BUTTON, exact: true }).click();
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.locator(".form-alert")).toHaveText("הגעת למגבלה של 3 התראות פעילות — בטלי התראה קיימת כדי להוסיף חדשה.");
  });

  test("is in the menu of both modes, and keeps the mode", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Passenger"));
    await page.goto("/");
    const menu = page.locator(".side-nav").filter({ visible: true });
    await menu.getByRole("link", { name: "ההתראות שלי" }).click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByText("אין לך התראות פעילות")).toBeVisible();

    // Shared, like the profile: from the driver's menu too, staying in driver mode.
    await page.goto("/dashboard");
    await menu.getByRole("link", { name: "ההתראות שלי" }).click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(menu.getByRole("link", { name: "לוח נהגת שבועי" })).toBeVisible();
  });

  test("lists her alerts, highlights the one from the email's link, and cancels it (spec C11)", async ({ page, seed, signIn }) => {
    const { origin, destination } = await groupPicks(seed);
    const passenger = await seed.user("Passenger");
    const create = (fields: Record<string, unknown>) =>
      passenger.db.rpc("create_ride_alert", { p_origins: [origin], p_destinations: [destination], ...fields });
    await create({});
    const { data: id } = await create({ p_from_time: "22:00", p_until_time: "02:00" });
    await signIn(page, passenger);

    await page.goto(`/alerts?alert=${id}`);
    await expect(alertRows(page)).toHaveCount(2);
    const highlighted = page.locator(".alert-row.row-highlighted");
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toContainText("יציאה 22:00–02:00");
    await expect(page.getByText("2 מתוך 3")).toBeVisible();

    await highlighted.getByRole("button", { name: "ביטול" }).click();
    await expect(page).toHaveURL(/\/alerts\?cancelled=1$/);
    await expect(toast(page, "ההתראה בוטלה")).toBeVisible();
    await expect(alertRows(page)).toHaveCount(1);
    await expect(alertRows(page)).toContainText("כל תאריך וכל שעה");
  });
});
