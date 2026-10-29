import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { rideDay, type Route, type Seed, type User } from "../integration/support/seed";
import { choose, israelDate, toast } from "./support/ui";

// The driver's weekly dashboard (spec D1–D6).

type Setup = { driver: User; route: Route; date: string; label: string };

// A driver with one ride on `date`, in a group named for this test.
async function driverWithRide(seed: Seed, { date = rideDay(2), seats = 3, time = "23:55" } = {}): Promise<Setup> {
  const driver = await seed.user("Driver");
  const origin = `E2E ${seed.tag} ${Math.random().toString(36).slice(2, 6)}`;
  const groupId = await seed.group({ origin, destination: "יעד" });
  const route = await seed.route(driver, { groupId, date, seats, time });
  return { driver, route, date, label: `${origin} ← יעד` };
}

const rideCard = (page: Page, label: string) => page.locator(".today-card").filter({ hasText: label });

async function openCard(card: Locator) {
  const toggle = card.locator(".today-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function addGuest(page: Page, card: Locator, name: string, phone: string) {
  await card.getByRole("button", { name: "הוספת טרמפיסטית" }).click();
  const form = page.locator("form.add-passenger");
  await form.getByLabel("שם מלא").fill(name);
  await form.getByLabel("טלפון").fill(phone);
  await form.getByRole("button", { name: "הוספה לנסיעה" }).click();
  return form;
}

test.describe("the week (spec D1)", () => {
  test("lists the ride with each passenger's name, phone, email and stops", async ({ page, seed, signIn }) => {
    const { driver, route, date, label } = await driverWithRide(seed);
    const passenger = await seed.user("Passenger", { fullName: "רחל נוסעת" });
    await seed.book(passenger, route, date);
    await signIn(page, driver);

    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);
    await expect(card).toContainText("1 מתוך 3 מקומות");
    const row = card.locator(".passenger-row");
    await expect(row).toContainText("רחל נוסעת");
    await expect(row).toContainText(passenger.phone!);
    await expect(row).toContainText(passenger.email);
    await expect(row.getByRole("button", { name: "הסרה" })).toHaveCount(0); // she booked herself (spec D6)
    await expect(card.locator(".daily-stops")).toContainText("Pickup A");
    await expect(card.locator(".daily-stops")).toContainText("Dropoff B");
  });

  test("shows the week's totals", async ({ page, seed, signIn }) => {
    const { driver, route, date } = await driverWithRide(seed, { seats: 4 });
    await seed.book(await seed.user("Passenger"), route, date);
    await signIn(page, driver);

    await page.goto(`/dashboard?date=${date}`);
    const stat = (label: string) => page.locator(".stat-card").filter({ hasText: label });
    await expect(stat("טרמפיסטיות רשומות")).toContainText("1");
    await expect(stat("מקומות פנויים")).toContainText("3");
    await expect(stat("תחנות איסוף")).toContainText("1");
    await expect(stat("נסיעות השבוע")).toContainText("1");
  });

  test("a week without rides says so", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Driver"));
    await page.goto(`/dashboard?date=${israelDate(60)}`);
    await expect(page.getByText("אין לך נסיעות בשבוע הזה")).toBeVisible();
  });

  test("today is marked, and once its rides have left it says so", async ({ page, seed, signIn }) => {
    const { driver, label } = await driverWithRide(seed, { date: israelDate(0), time: "00:00" });
    await signIn(page, driver);
    await page.goto("/dashboard");
    const day = page.locator("details.week-day").filter({ hasText: label });
    await expect(day.locator("summary")).toContainText("היום");
    await expect(day.locator("summary")).toContainText("שעת היציאה עברה");
    // A ride that left can't be cancelled (spec D3).
    await expect(rideCard(page, label).getByRole("button", { name: "ביטול הנסיעה לתאריך זה בלבד" })).toHaveCount(0);
  });

  test("days fold, and 'open all' / 'close all' toggle them", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    await seed.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5], date: null, time: "23:55" });
    await signIn(page, driver);
    // Next week: every one of its six ride days is listed.
    await page.goto(`/dashboard?date=${israelDate(7)}`);

    const days = page.locator("details.week-day");
    await expect(days).toHaveCount(6);
    await expect(page.locator("details.week-day[open]")).toHaveCount(1);
    await page.getByRole("button", { name: "פתיחת הכל" }).click();
    await expect(page.locator("details.week-day[open]")).toHaveCount(6);
    await page.getByRole("button", { name: "סגירת הכל" }).click();
    await expect(page.locator("details.week-day[open]")).toHaveCount(0);
  });

  // Removed routes don't appear (spec D1).
  test("leaves out removed routes", async ({ page, seed, signIn }) => {
    const { driver, route, date, label } = await driverWithRide(seed);
    await driver.db.from("routes").update({ is_active: false }).eq("id", route.id);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    await expect(rideCard(page, label)).toHaveCount(0);
  });
});

test.describe("cancelling a date (spec D2)", () => {
  test("asks first, then marks the date cancelled for good", async ({ page, seed, signIn }) => {
    const { driver, route, date, label } = await driverWithRide(seed);
    const passenger = await seed.user("Passenger");
    await seed.book(passenger, route, date);
    await signIn(page, driver);

    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await card.getByRole("button", { name: "ביטול הנסיעה לתאריך זה בלבד" }).click();
    await expect(card.getByText("לבטל את הנסיעה? אי אפשר להחזיר אותה.")).toBeVisible();
    await card.getByRole("button", { name: "כן, לבטל" }).click();

    await expect(toast(page, "הנסיעה בוטלה לתאריך הזה בלבד")).toBeVisible();
    await expect(card.locator(".status-pill")).toHaveText("בוטלה לתאריך זה");
    await expect(card.getByRole("button", { name: "ביטול הנסיעה לתאריך זה בלבד" })).toHaveCount(0);
    await openCard(card);
    await expect(card.getByRole("button", { name: "הוספת טרמפיסטית" })).toHaveCount(0);

    await page.reload();
    await expect(rideCard(page, label).locator(".status-pill")).toHaveText("בוטלה לתאריך זה");
    // Cancelled dates aren't counted in the week's rides.
    await expect(page.locator(".stat-card").filter({ hasText: "נסיעות השבוע" })).toContainText("0");

    // The passenger finds out in my rides (spec D2, passenger side).
    await signIn(page, passenger);
    await page.goto("/my-rides");
    await expect(page.locator(".activity-row .status-pill")).toHaveText("הנהגת ביטלה את הנסיעה");
  });

  test("can be called off before confirming", async ({ page, seed, signIn }) => {
    const { driver, date, label } = await driverWithRide(seed);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await card.getByRole("button", { name: "ביטול הנסיעה לתאריך זה בלבד" }).click();
    await card.getByRole("button", { name: "ביטול", exact: true }).click();
    await expect(card.locator(".status-pill")).toHaveCount(0);
  });
});

test.describe("passengers added by hand (spec D4–D6)", () => {
  test("adds a guest who takes a seat and is marked 'נוספה על ידך'", async ({ page, seed, signIn }) => {
    const { driver, date, label } = await driverWithRide(seed);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);

    await addGuest(page, card, "שרה אורחת", "052-765-4321");
    await expect(toast(page, "שרה אורחת נוספה לנסיעה")).toBeVisible();
    const row = card.locator(".passenger-row").filter({ hasText: "שרה אורחת" });
    await expect(row).toContainText("נוספה על ידך");
    await expect(row).toContainText("052-765-4321");
    await expect(card).toContainText("1 מתוך 3 מקומות");
  });

  test("checks the form, and refuses the driver's own phone", async ({ page, seed, signIn }) => {
    const { driver, date, label } = await driverWithRide(seed);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);

    const form = await addGuest(page, card, "שרה", "123");
    await expect(form.locator(".field-error")).toHaveText("מספר טלפון לא תקין (לדוגמה 050-000-0000)");
    await form.getByLabel("טלפון").fill(driver.phone!);
    await form.getByRole("button", { name: "הוספה לנסיעה" }).click();
    await expect(form.locator(".field-error")).toHaveText("אי אפשר להוסיף את עצמך כטרמפיסטית.");
  });

  test("refuses the phone of a passenger who booked herself", async ({ page, seed, signIn }) => {
    const { driver, route, date, label } = await driverWithRide(seed);
    const passenger = await seed.user("Passenger");
    await seed.book(passenger, route, date);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);
    const form = await addGuest(page, card, "שרה", passenger.phone!);
    await expect(form.locator(".field-error")).toHaveText("הטרמפיסטית כבר רשומה לנסיעה הזו.");
  });

  test("lets her pick the guest's stops", async ({ page, seed, signIn }) => {
    const { driver, route, date, label } = await driverWithRide(seed);
    await seed.service.from("stops").insert({ route_id: route.id, kind: "pickup", label: "Pickup C", position: 2 });
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);
    await card.getByRole("button", { name: "הוספת טרמפיסטית" }).click();
    const form = page.locator("form.add-passenger");
    await form.getByLabel("שם מלא").fill("שרה");
    await form.getByLabel("טלפון").fill("052-765-4321");
    await choose(page, "תחנת איסוף", "Pickup C", form);
    await form.getByRole("button", { name: "הוספה לנסיעה" }).click();
    await expect(toast(page, "שרה נוספה לנסיעה")).toBeVisible();
    await page.reload();
    await openCard(rideCard(page, label));
    await expect(rideCard(page, label).locator(".daily-stops")).toContainText("Pickup C");
  });

  test("the same phone again asks before replacing, and replacing keeps one seat (spec D5)", async ({ page, seed, signIn }) => {
    const { driver, date, label } = await driverWithRide(seed);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);
    await addGuest(page, card, "שרה ראשונה", "052-765-4321");
    await expect(card.locator(".passenger-row")).toHaveCount(1);

    // Written differently, the same digits.
    const form = await addGuest(page, card, "שרה שנייה", "0527654321");
    const question = form.getByText("כבר יש הרשמה עם מספר הטלפון הזה (שרה ראשונה). להחליף אותה?");
    await expect(question).toBeVisible();

    // "ביטול" keeps the form as typed, and saves nothing.
    await form.getByRole("button", { name: "ביטול" }).click();
    await expect(question).toHaveCount(0);
    await expect(form.getByLabel("שם מלא")).toHaveValue("שרה שנייה");

    await form.getByRole("button", { name: "הוספה לנסיעה" }).click();
    await form.getByRole("button", { name: "כן, להחליף" }).click();
    await expect(toast(page, "ההרשמה של שרה שנייה עודכנה")).toBeVisible();
    await expect(card.locator(".passenger-row")).toHaveCount(1);
    await expect(card.locator(".passenger-row")).toContainText("שרה שנייה");
    await expect(card).toContainText("1 מתוך 3 מקומות");
  });

  test("changing a field drops the replace question", async ({ page, seed, signIn }) => {
    const { driver, date, label } = await driverWithRide(seed);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);
    await addGuest(page, card, "שרה", "052-765-4321");
    const form = await addGuest(page, card, "שרה", "052-765-4321");
    await expect(form.getByRole("button", { name: "כן, להחליף" })).toBeVisible();
    await form.getByLabel("טלפון").fill("052-765-4322");
    await expect(form.getByRole("button", { name: "כן, להחליף" })).toHaveCount(0);
    await expect(form.getByRole("button", { name: "הוספה לנסיעה" })).toBeVisible();
  });

  test("removes a guest after asking, freeing the seat (spec D6)", async ({ page, seed, signIn }) => {
    const { driver, date, label } = await driverWithRide(seed);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);
    await addGuest(page, card, "שרה אורחת", "052-765-4321");

    const row = card.locator(".passenger-row").filter({ hasText: "שרה אורחת" });
    await row.getByRole("button", { name: "הסרה" }).click();
    await expect(row.getByText("להסיר את שרה אורחת מהנסיעה?")).toBeVisible();
    await row.getByRole("button", { name: "כן, להסיר" }).click();
    await expect(card.locator(".passenger-row")).toHaveCount(0);
    await expect(card).toContainText("0 מתוך 3 מקומות");
  });

  test("the add form isn't offered on a full ride", async ({ page, seed, signIn }) => {
    const { driver, route, date, label } = await driverWithRide(seed, { seats: 1 });
    await seed.book(await seed.user("Passenger"), route, date);
    await signIn(page, driver);
    await page.goto(`/dashboard?date=${date}`);
    const card = rideCard(page, label);
    await openCard(card);
    await expect(card.locator(".passenger-row")).toHaveCount(1);
    await expect(card.getByRole("button", { name: "הוספת טרמפיסטית" })).toHaveCount(0);
  });

  // Only the driver ever sees a guest (spec D4): other passengers see one seat fewer.
  test("passengers see only one seat fewer", async ({ page, seed, signIn }) => {
    const { driver, route, date } = await driverWithRide(seed);
    await seed.addGuest(driver, route, date, { name: "אורחת סודית" });
    await signIn(page, await seed.user("Passenger"));
    await page.goto(`/ride/${route.id}?date=${date}`);
    await expect(page.locator(".detail-meta")).toContainText("2 מקומות פנויים");
    await expect(page.getByText("אורחת סודית")).toHaveCount(0);
  });
});
