import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { rideDay, type Seed } from "../integration/support/seed";
import { choose, chooseTime, expectNotFound, israelDate, openForm, toast } from "./support/ui";

// The driver's routes (spec B1–B5, F1–F3): publishing, form problems, the
// locked edit page, removing, and the history and cancelled tabs.

// A group named for this test, so its cards are easy to find.
async function namedGroup(seed: Seed) {
  const origin = `E2E ${seed.tag} ${Math.random().toString(36).slice(2, 6)}`;
  const id = await seed.group({ origin, destination: "יעד" });
  return { id, label: `${origin} ← יעד` };
}

const routeCard = (page: Page, label: string) => page.locator(".route-card").filter({ hasText: label });
const pickupInputs = (page: Page) => page.locator(".editor-stop-group:not(.dropoff-editor-group) input");
const dropoffInputs = (page: Page) => page.locator(".dropoff-editor-group input");

async function addStops(page: Page, pickup: string, dropoff: string) {
  await page.getByRole("button", { name: "הוספת תחנת איסוף" }).click();
  await pickupInputs(page).last().fill(pickup);
  await page.getByRole("button", { name: "הוספת תחנת הורדה" }).click();
  await dropoffInputs(page).last().fill(dropoff);
}

test.describe("publishing (spec B1, B2)", () => {
  test("a recurring route appears in my routes, in search and on the dashboard", async ({ page, browser, seed, signIn }) => {
    const { label } = await namedGroup(seed);
    const driver = await seed.user("Driver");
    await signIn(page, driver);

    await openForm(page, "/routes/new", "שמירת המסלול");
    await choose(page, "קבוצת נסיעה", label);
    const days = page.getByRole("group", { name: "ימים בשבוע" }).getByRole("button");
    await expect(days).toHaveCount(6); // Sunday to Friday
    for (let i = 0; i < 6; i++) {
      if ((await days.nth(i).getAttribute("aria-pressed")) !== "true") await days.nth(i).click();
    }
    await chooseTime(page, "שעת יציאה", "23:55");
    await page.getByLabel("מקומות פנויים").fill("3");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("7");
    await page.getByLabel("הערות לטרמפיסטיות").fill("מחכה עד 5 דקות");
    await addStops(page, "תחנת איסוף א", "תחנת הורדה ב");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(toast(page, "המסלול נשמר ופורסם")).toBeVisible();
    const card = routeCard(page, label);
    await expect(card).toContainText("מסלול קבוע");
    await expect(card).toContainText("א׳ · ב׳ · ג׳ · ד׳ · ה׳ · ו׳");
    await expect(card).toContainText("יציאה ב־23:55");
    await expect(card).toContainText("3 מקומות · ₪7 לטרמפיסטית");

    // Passengers find it (spec B1, passenger side).
    const passengerPage = await browser.newPage();
    await signIn(passengerPage, await seed.user("Passenger"));
    await passengerPage.goto("/");
    await expect(passengerPage.locator(".trip-card").filter({ hasText: label.split(" ← ")[0] })).toContainText("מחכה עד 5 דקות");
    await passengerPage.close();

    // Each of its dates is on the dashboard.
    await page.goto(`/dashboard?date=${rideDay(1)}`);
    await expect(page.locator(".today-card").filter({ hasText: label })).not.toHaveCount(0);
  });

  test("a one-time ride is listed under active routes with its date", async ({ page, seed, signIn }) => {
    const { label } = await namedGroup(seed);
    await signIn(page, await seed.user("Driver"));
    await openForm(page, "/routes/new", "שמירת המסלול");
    await choose(page, "קבוצת נסיעה", label);
    await page.getByRole("button", { name: "נסיעה חד־פעמית" }).click();
    await expect(page.getByRole("group", { name: "ימים בשבוע" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^תאריך הנסיעה:/ })).toBeVisible();
    await chooseTime(page, "שעת יציאה", "23:55");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("12");
    await addStops(page, "תחנת איסוף א", "תחנת הורדה ב");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(routeCard(page, label)).toContainText("נסיעה חד־פעמית");
  });

  test("the date picker can't go before today", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Driver"));
    await openForm(page, "/routes/new", "שמירת המסלול");
    await page.getByRole("button", { name: /^תאריך התחלה:/ }).click();
    await expect(page.getByRole("dialog", { name: "תאריך התחלה" }).getByRole("button", { name: "החודש הקודם" })).toBeDisabled();
  });

  test("'ביטול' leaves the editor without saving", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Driver"));
    await openForm(page, "/routes/new", "שמירת המסלול");
    await page.getByRole("link", { name: "ביטול" }).click();
    await expect(page).toHaveURL(/\/routes$/);
    await expect(page.getByText("אין לך מסלולים פעילים")).toBeVisible();
  });
});

test.describe("form problems (spec B5)", () => {
  test.beforeEach(async ({ page, seed, signIn }) => {
    await namedGroup(seed);
    await signIn(page, await seed.user("Driver"));
    await openForm(page, "/routes/new", "שמירת המסלול");
  });

  const save = (page: Page) => page.getByRole("button", { name: "שמירת המסלול" }).click();
  const alert = (page: Page) => page.locator(".form-alert");

  test("no weekday", async ({ page }) => {
    const days = page.getByRole("group", { name: "ימים בשבוע" }).getByRole("button");
    for (let i = 0; i < 6; i++) {
      if ((await days.nth(i).getAttribute("aria-pressed")) === "true") await days.nth(i).click();
    }
    await addStops(page, "תחנה א", "תחנה ב");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("10");
    await save(page);
    await expect(alert(page)).toHaveText("יש לבחור לפחות יום אחד");
  });

  test("no stops", async ({ page }) => {
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("10");
    await save(page);
    await expect(alert(page)).toHaveText("יש להוסיף לפחות תחנת איסוף אחת");
  });

  test("a pickup but no drop-off", async ({ page }) => {
    await page.getByRole("button", { name: "הוספת תחנת איסוף" }).click();
    await pickupInputs(page).last().fill("תחנה א");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("10");
    await save(page);
    await expect(alert(page)).toHaveText("יש להוסיף לפחות תחנת הורדה אחת");
  });

  test("a stop without a name, and a one-letter name", async ({ page }) => {
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("10");
    await addStops(page, "", "תחנה ב");
    await save(page);
    await expect(alert(page)).toHaveText("יש לתת שם לכל תחנה");
    await pickupInputs(page).last().fill("א");
    await save(page);
    await expect(alert(page)).toHaveText("שם התחנה צריך להכיל לפחות 2 תווים");
  });

  test("9 seats, then a bad price", async ({ page }) => {
    await addStops(page, "תחנה א", "תחנה ב");
    await page.getByLabel("מקומות פנויים").fill("9");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("10");
    await save(page);
    await expect(alert(page)).toHaveText("בין 1 ל־8 מקומות");
    await page.getByLabel("מקומות פנויים").fill("3");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("abc");
    await save(page);
    await expect(alert(page)).toHaveText("מחיר לא תקין");
  });

  test("nothing is saved", async ({ page }) => {
    let posted = false;
    page.on("request", (r) => r.method() === "POST" && (posted = true));
    await save(page);
    await expect(alert(page)).toBeVisible();
    expect(posted).toBe(false);
    await page.goto("/routes");
    await expect(page.getByText("אין לך מסלולים פעילים")).toBeVisible();
  });
});

test.describe("editing a published route (spec B4)", () => {
  test("everything is locked except the note and new stops", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { id: groupId, label } = await namedGroup(seed);
    const route = await seed.route(driver, { groupId, kind: "recurring", date: null, seats: 3, price: 7, time: "06:05" });
    const passenger = await seed.user("Passenger");
    await signIn(page, driver);

    await page.goto("/routes");
    await routeCard(page, label).getByRole("link", { name: "עריכת מסלול" }).click();
    await expect(page).toHaveURL(new RegExp(`/routes/${route.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "עריכת מסלול" })).toBeVisible();
    await expect(page.getByRole("button", { name: "שמירת השינויים" })).toBeEnabled();

    await expect(page.getByRole("button", { name: `קבוצת נסיעה: ${label}` })).toBeDisabled();
    await expect(page.getByLabel("מקומות פנויים")).toHaveValue("3");
    await expect(page.getByLabel("מקומות פנויים")).toBeDisabled();
    await expect(page.getByLabel("מחיר לכל טרמפיסטית")).toBeDisabled();
    await expect(page.getByRole("button", { name: "שעת יציאה: 06:05" })).toBeDisabled();
    await expect(pickupInputs(page).first()).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "מחיקת התחנה" })).toHaveCount(0);

    await page.getByLabel("הערות לטרמפיסטיות").fill("מחכה עד 10 דקות");
    await page.getByRole("button", { name: "הוספת תחנת הורדה" }).click();
    await dropoffInputs(page).last().fill("תחנה חדשה");
    await page.getByRole("button", { name: "שמירת השינויים" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(routeCard(page, label)).toHaveCount(1); // the same route, not a new one
    await page.goto(`/routes/${route.id}`);
    await expect(page.getByLabel("הערות לטרמפיסטיות")).toHaveValue("מחכה עד 10 דקות");
    await expect(dropoffInputs(page)).toHaveCount(2);
    await expect(dropoffInputs(page).nth(0)).toHaveValue("Dropoff B");
    await expect(dropoffInputs(page).nth(1)).toHaveValue("תחנה חדשה");

    // The new note and stop reach passengers (spec B4, passenger side).
    await signIn(page, passenger);
    await page.goto(`/?group=${groupId}`);
    await expect(page.locator(".trip-card").first()).toContainText("מחכה עד 10 דקות");
  });

  test("a note can be saved on its own, or cleared", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const route = await seed.route(driver, { notes: "ישנה" });
    await signIn(page, driver);
    await openForm(page, `/routes/${route.id}`, "שמירת השינויים");
    await page.getByLabel("הערות לטרמפיסטיות").fill("");
    await page.getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    const { data } = await seed.service.from("routes").select("notes").eq("id", route.id).single();
    expect(data!.notes).toBeNull();
  });

  test("a new stop without a name blocks saving", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const route = await seed.route(driver);
    await signIn(page, driver);
    await openForm(page, `/routes/${route.id}`, "שמירת השינויים");
    await page.getByRole("button", { name: "הוספת תחנת איסוף" }).click();
    await page.getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(page.locator(".form-alert")).toHaveText("יש לתת שם לכל תחנה");
  });
});

test.describe("removing (spec F1)", () => {
  test("asks first, warns about booked passengers, and can be called off", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { id: groupId, label } = await namedGroup(seed);
    await seed.route(driver, { groupId });
    await signIn(page, driver);
    await page.goto("/routes");
    const card = routeCard(page, label);

    await card.getByRole("button", { name: "הסרת המסלול" }).click();
    await expect(card.getByText("להסיר את המסלול?")).toBeVisible();
    await expect(card.locator(".archive-warning")).toContainText("ודאי שאין טרמפיסטיות רשומות");
    await card.getByRole("button", { name: "ביטול" }).click();
    await expect(card.getByRole("button", { name: "הסרת המסלול" })).toBeVisible();
  });

  test("removes the route for good: it leaves my routes and can't be edited", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { id: groupId, label } = await namedGroup(seed);
    const route = await seed.route(driver, { groupId });
    await signIn(page, driver);
    await page.goto("/routes");

    await routeCard(page, label).getByRole("button", { name: "הסרת המסלול" }).click();
    await routeCard(page, label).getByRole("button", { name: "כן, להסיר" }).click();
    await expect(routeCard(page, label)).toHaveCount(0);
    await page.goto(`/routes/${route.id}`);
    await expectNotFound(page);
  });
});

test.describe("history and cancelled tabs (spec F2, F3)", () => {
  test("a one-time ride that took place sits in history, with no buttons", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const route = await seed.route(driver, { date: israelDate(-1) });
    await signIn(page, driver);

    await page.goto("/routes");
    await expect(page.getByText("אין לך מסלולים פעילים")).toBeVisible();
    await page.getByRole("link", { name: "היסטוריה" }).click();
    const card = page.locator(".route-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(card.getByRole("link")).toHaveCount(0);

    // Opening its edit page returns to my routes (spec B4).
    await page.goto(`/routes/${route.id}`);
    await expect(page).toHaveURL(/\/routes$/);
  });

  test("a one-time ride cancelled for its date moves to the cancelled tab", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const route = await seed.route(driver, { date });
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    await signIn(page, driver);

    await page.goto("/routes?tab=cancelled");
    const card = page.locator(".route-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button", { name: "הסרת המסלול" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: "עריכת מסלול" })).toHaveCount(0);
    await page.goto("/routes");
    await expect(page.locator(".route-card")).toHaveCount(0);
  });

  // Past dates of a recurring route aren't listed in history (spec §8).
  test("a recurring route stays active, never in history", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    await seed.route(driver, { kind: "recurring", date: israelDate(-30) });
    await signIn(page, driver);
    await page.goto("/routes?tab=history");
    await expect(page.getByText("עוד אין נסיעות שהתקיימו")).toBeVisible();
  });
});
