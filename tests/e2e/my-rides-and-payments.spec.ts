import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { choose, israelDate, optionsOf, toast } from "./support/ui";

// A passenger's rides (spec E1–E3, G1, §6) and payments (G2, §2 Charges).

const rows = (page: Page) => page.locator(".activity-row");
const amount = (text: string) => Number(text.replace(/[₪,]/g, ""));

test.describe("my rides", () => {
  test("cancels an upcoming ride in one click, freeing the seat (spec E1)", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const route = await seed.route(driver, { date, seats: 1 });
    const passenger = await seed.user("Passenger");
    await seed.book(passenger, route, date);
    await signIn(page, passenger);

    await page.goto("/my-rides");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(driver.phone!);
    await rows(page).first().getByRole("button", { name: "ביטול" }).click();

    await expect(page).toHaveURL(/\/my-rides\?cancelled=1$/);
    await expect(toast(page, "ההרשמה בוטלה והמקום התפנה")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    expect(await seed.seatsLeft(passenger, route, date)).toBe(1);
  });

  test("moves a departed ride to history, with no cancel button (spec E2, G1)", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const passenger = await seed.user("Passenger");
    const past = israelDate(-2);
    await seed.bookDirectly(passenger, await seed.route(driver, { date: past }), past);
    await signIn(page, passenger);

    await page.goto("/my-rides");
    await expect(page.getByText("אין לך נסיעות קרובות")).toBeVisible();
    await page.getByRole("link", { name: "היסטוריה" }).click();
    await expect(page).toHaveURL(/tab=history/);
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "ביטול" })).toHaveCount(0);
  });

  test("lists history newest first", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const passenger = await seed.user("Passenger");
    for (const days of [-5, -2, -9]) {
      const date = israelDate(days);
      await seed.bookDirectly(passenger, await seed.route(driver, { date }), date);
    }
    await signIn(page, passenger);
    await page.goto("/my-rides?tab=history");
    await expect(rows(page)).toHaveCount(3);
    const first = await rows(page).nth(0).locator(".activity-date span").innerText();
    const last = await rows(page).nth(2).locator(".activity-date span").innerText();
    expect(first).toContain(String(Number(israelDate(-2).slice(8))));
    expect(last).toContain(String(Number(israelDate(-9).slice(8))));
  });

  test("a date the driver cancelled is labelled and can't be cancelled again (spec D2, E3)", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const route = await seed.route(driver, { date });
    const passenger = await seed.user("Passenger");
    await seed.book(passenger, route, date);
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    await signIn(page, passenger);

    await page.goto("/my-rides");
    const row = rows(page).first();
    await expect(row.locator(".status-pill")).toHaveText("הנהגת ביטלה את הנסיעה");
    await expect(row.getByRole("button", { name: "ביטול" })).toHaveCount(0);
    // Her driver's contact details stay visible (spec D2 rules, §5).
    await expect(row).toContainText(driver.phone!);
  });

  test("a removed route's booked dates show as cancelled by the driver (spec F1)", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const route = await seed.route(driver, { date });
    const passenger = await seed.user("Passenger");
    await seed.book(passenger, route, date);
    await driver.db.from("routes").update({ is_active: false }).eq("id", route.id);
    await signIn(page, passenger);

    await page.goto("/my-rides");
    await expect(rows(page).first().locator(".status-pill")).toHaveText("הנהגת ביטלה את הנסיעה");
  });

  test("with no rides, links to search", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Passenger"));
    await page.goto("/my-rides");
    await page.locator(".empty-state").getByRole("link", { name: "מציאת נסיעה" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("payments (spec G2, §2 Charges)", () => {
  test("charges departed rides only — not upcoming, cancelled or driver-cancelled ones", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver", { fullName: "דנה נהגת" });
    const passenger = await seed.user("Passenger");
    const past = israelDate(-1);
    const thisMonth = past.slice(0, 7) === israelDate(0).slice(0, 7);
    test.skip(!thisMonth, "Yesterday was last month; the month filter is tested below");

    await seed.bookDirectly(passenger, await seed.route(driver, { date: past, price: 20 }), past); // charged
    const cancelledByDriver = await seed.route(driver, { date: past, price: 7 });
    await seed.bookDirectly(passenger, cancelledByDriver, past);
    await seed.service.from("ride_exceptions").insert({ route_id: cancelledByDriver.id, ride_date: past, cancelled: true });
    const upcoming = israelDate(2);
    await seed.book(passenger, await seed.route(driver, { date: upcoming, price: 11 }), upcoming); // not yet
    const cancelledByHer = await seed.route(driver, { date: past, price: 13 });
    const id = await seed.bookDirectly(passenger, cancelledByHer, past);
    await seed.service.from("bookings").update({ status: "cancelled" }).eq("id", id);
    await signIn(page, passenger);

    await page.goto("/payments");
    await expect(page.locator(".payment-row")).toHaveCount(1);
    await expect(page.locator(".payment-row")).toContainText("₪20 · לא שולם");
    const [total, paid, left] = (await page.locator(".payment-summary strong").allInnerTexts()).map(amount);
    expect([total, paid, left]).toEqual([20, 0, 20]);
    await expect(page.locator(".balance-row")).toContainText("דנה נהגת");
    await expect(page.locator(".balance-row")).toContainText("₪20");
  });

  test("marking a ride paid updates the totals and the balance, and can be undone", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const passenger = await seed.user("Passenger");
    const past = israelDate(-1);
    test.skip(past.slice(0, 7) !== israelDate(0).slice(0, 7), "Yesterday was last month");
    await seed.bookDirectly(passenger, await seed.route(driver, { date: past, price: 20 }), past);
    await signIn(page, passenger);

    await page.goto("/payments");
    const pill = page.locator(".paid-pill");
    // The pill flips at once; wait for the save before reloading.
    const saved = () => page.waitForResponse((r) => r.request().method() === "POST");
    await Promise.all([saved(), pill.click()]);
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    await expect(pill).toContainText("שולם");
    await page.reload();
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    const [, paid, left] = (await page.locator(".payment-summary strong").allInnerTexts()).map(amount);
    expect([paid, left]).toEqual([20, 0]);
    await expect(page.locator(".driver-balances")).toHaveCount(0); // nothing left to pay

    await Promise.all([saved(), pill.click()]);
    await expect(pill).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(pill).toContainText("לא שולם");
  });

  test("the month picker offers this month and the 3 before, and filters by month", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const passenger = await seed.user("Passenger");
    const lastMonth = new Date(`${israelDate(0).slice(0, 7)}-15T12:00:00Z`);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const date = lastMonth.toISOString().slice(0, 10);
    await seed.bookDirectly(passenger, await seed.route(driver, { date, price: 30 }), date);
    await signIn(page, passenger);

    await page.goto("/payments");
    const months = await optionsOf(page, "חודש");
    expect(months).toHaveLength(4);
    await expect(page.locator(".payment-row")).toHaveCount(0);
    await expect(page.locator(".balance-row")).toContainText("₪30"); // the balance covers every month

    await choose(page, "חודש", months[1]);
    await expect(page).toHaveURL(new RegExp(`month=${date.slice(0, 7)}$`));
    await expect(page.locator(".payment-row")).toHaveCount(1);
  });

  test("an unknown month falls back to this month", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Passenger"));
    await page.goto("/payments?month=1999-01");
    const months = await optionsOf(page, "חודש");
    await expect(page.getByRole("button", { name: `חודש: ${months[0]}` })).toBeVisible();
  });
});
