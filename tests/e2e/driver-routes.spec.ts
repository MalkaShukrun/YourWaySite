import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { rideDay, type Seed } from "../integration/support/seed";
import { choose, chooseTime, expectNotFound, israelDate, openForm, toast } from "./support/ui";

// The driver's routes (spec B1–B5, F1–F3): publishing, form problems, the
// edit page (full until booked, then locked), removing, and the history and
// cancelled tabs.

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
  test("nobody has booked it: every detail and stop can change", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { label } = await namedGroup(seed);
    const route = await seed.route(driver, { kind: "recurring", date: null, seats: 3, price: 7, time: "06:05" });
    await signIn(page, driver);

    await openForm(page, `/routes/${route.id}`, "שמירת השינויים");
    await expect(page.getByText("עדיין לא נרשמו טרמפיסטיות למסלול")).toBeVisible();
    await choose(page, "קבוצת נסיעה", label);
    await page.getByLabel("מקומות פנויים").fill("5");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("12");
    await pickupInputs(page).first().fill("תחנה ששונתה");
    await expect(page.getByRole("button", { name: "מחיקת התחנה" })).toHaveCount(2);
    await expect(page.locator(".editor-stops > .is-fixed")).toHaveCount(0);
    await page.getByRole("button", { name: "שמירת השינויים" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(routeCard(page, label)).toHaveCount(1); // the same route, moved to the new group
    const { data } = await seed.service.from("routes").select("seats, price").eq("id", route.id).single();
    expect(data).toEqual({ seats: 5, price: 12 });
    await page.goto(`/routes/${route.id}`);
    await expect(pickupInputs(page).first()).toHaveValue("תחנה ששונתה");
  });

  test("nobody has booked it and its group was hidden: it's saved in the group the form shows", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const hidden = await seed.group({ active: false });
    const route = await seed.route(driver, { groupId: hidden });
    await signIn(page, driver);

    await openForm(page, `/routes/${route.id}`, "שמירת השינויים");
    const shown = await page.getByRole("combobox", { name: "קבוצת נסיעה", exact: true }).inputValue();
    await page.getByRole("button", { name: "שמירת השינויים" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    const { data } = await seed.service.from("routes").select("group_id, ride_groups(origin)").eq("id", route.id).single();
    expect(data!.group_id).not.toBe(hidden);
    expect(shown).toContain((data!.ride_groups as unknown as { origin: string }).origin);
  });

  test("once booked, everything is locked except the note and new stops", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { id: groupId, label } = await namedGroup(seed);
    const route = await seed.route(driver, { groupId, kind: "recurring", date: null, seats: 3, price: 7, time: "06:05" });
    const passenger = await seed.user("Passenger");
    // A past booking still locks it: the passenger's history keeps the ride.
    const past = israelDate(-7);
    await seed.bookDirectly(await seed.user("Booked"), route, past);
    await signIn(page, driver);

    await page.goto("/routes");
    await routeCard(page, label).getByRole("link", { name: "עריכת מסלול" }).click();
    await expect(page).toHaveURL(new RegExp(`/routes/${route.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "עריכת מסלול" })).toBeVisible();
    await expect(page.getByRole("button", { name: "שמירת השינויים" })).toBeEnabled();

    await expect(page.getByRole("combobox", { name: "קבוצת נסיעה", exact: true })).toHaveValue(label);
    await expect(page.getByRole("combobox", { name: "קבוצת נסיעה", exact: true })).toBeDisabled();
    await expect(page.getByLabel("מקומות פנויים")).toHaveValue("3");
    await expect(page.getByLabel("מקומות פנויים")).toBeDisabled();
    await expect(page.getByLabel("מחיר לכל טרמפיסטית")).toBeDisabled();
    await expect(page.getByRole("button", { name: "שעת יציאה: 06:05" })).toBeDisabled();
    await expect(pickupInputs(page).first()).toHaveAttribute("readonly", "");
    await expect(pickupInputs(page).first()).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".editor-stops > .is-fixed")).toHaveCount(2); // shown like the other locked fields
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
  test("a one-time ride that took place sits in history, and can only be copied", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const route = await seed.route(driver, { date: israelDate(-1) });
    await signIn(page, driver);

    await page.goto("/routes");
    await expect(page.getByText("אין לך מסלולים פעילים")).toBeVisible();
    await page.getByRole("link", { name: "היסטוריה" }).click();
    const card = page.locator(".route-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(card.getByRole("link")).toHaveText(["שכפול נסיעה"]);

    // Opening its edit page returns to my routes (spec B4).
    await page.goto(`/routes/${route.id}`);
    await expect(page).toHaveURL(/\/routes$/);
  });

  test("copying a past ride publishes a new one with the changed details", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { id: groupId, label } = await namedGroup(seed);
    const route = await seed.route(driver, { groupId, date: israelDate(-1), seats: 3, price: 7, time: "06:05", notes: "ישנה" });
    await signIn(page, driver);

    await page.goto("/routes?tab=history");
    await routeCard(page, label).getByRole("link", { name: "שכפול נסיעה" }).click();
    await expect(page).toHaveURL(new RegExp(`/routes/new\\?copy=${route.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "שכפול נסיעה" })).toBeVisible();
    await expect(page.getByRole("button", { name: "שמירת המסלול" })).toBeEnabled();

    // Its details are filled in and open to change; the date has to be chosen.
    await expect(page.getByRole("combobox", { name: "קבוצת נסיעה", exact: true })).toHaveValue(label);
    await expect(page.getByRole("combobox", { name: "קבוצת נסיעה", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "נסיעה חד־פעמית" })).toHaveClass(/active/);
    await expect(page.getByRole("button", { name: "נסיעה קבועה" })).not.toHaveClass(/active/);
    await expect(page.getByRole("button", { name: "שעת יציאה: 06:05" })).toBeEnabled();
    await expect(page.getByLabel("מקומות פנויים")).toHaveValue("3");
    await expect(page.getByLabel("מחיר לכל טרמפיסטית")).toHaveValue("7");
    await expect(page.getByLabel("הערות לטרמפיסטיות")).toHaveValue("ישנה");
    await expect(pickupInputs(page).first()).not.toHaveAttribute("readonly", "");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();
    await expect(page.locator(".form-alert")).toHaveText("יש לבחור תאריך");

    await page.getByRole("button", { name: /^תאריך הנסיעה:/ }).click();
    await page.getByRole("dialog", { name: "תאריך הנסיעה" }).getByRole("button", { name: "החודש הבא" }).click();
    await page.getByRole("dialog", { name: "תאריך הנסיעה" }).locator(".calendar-grid button:not(.outside)").first().click();
    await page.getByLabel("מקומות פנויים").fill("5");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("12");
    await pickupInputs(page).first().fill("תחנה חדשה");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(routeCard(page, label)).toContainText("5 מקומות · ₪12 לטרמפיסטית");

    // The original stays in history as it was.
    await page.goto("/routes?tab=history");
    await expect(routeCard(page, label)).toContainText("3 מקומות · ₪7 לטרמפיסטית");
  });

  test("a copy shows its ride's details after the new-route page or another copy was open", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const first = await namedGroup(seed);
    const second = await namedGroup(seed);
    await seed.route(driver, { groupId: first.id, date: israelDate(-1), seats: 3, price: 7, time: "06:05", notes: "ראשונה" });
    await seed.route(driver, { groupId: second.id, date: israelDate(-2), seats: 2, price: 9, time: "08:10", notes: "שנייה" });
    await signIn(page, driver);

    const expectCopyOf = async (time: string, seats: string, price: string, notes: string) => {
      await expect(page.getByRole("heading", { level: 1, name: "שכפול נסיעה" })).toBeVisible();
      await expect(page.getByRole("button", { name: "נסיעה חד־פעמית" })).toHaveClass(/active/);
      await expect(page.getByRole("button", { name: `שעת יציאה: ${time}` })).toBeVisible();
      await expect(page.getByLabel("מקומות פנויים")).toHaveValue(seats);
      await expect(page.getByLabel("מחיר לכל טרמפיסטית")).toHaveValue(price);
      await expect(page.getByLabel("הערות לטרמפיסטיות")).toHaveValue(notes);
    };

    // Each step is a client navigation, so an open page could be kept and reused.
    await page.goto("/routes");
    await page.getByRole("link", { name: "הוספת מסלול" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "מסלול חדש" })).toBeVisible();
    await page.getByRole("link", { name: "חזרה למסלולים" }).click();
    await page.getByRole("link", { name: "היסטוריה" }).click();
    await routeCard(page, first.label).getByRole("link", { name: "שכפול נסיעה" }).click();
    await expectCopyOf("06:05", "3", "7", "ראשונה");

    await page.getByRole("link", { name: "חזרה למסלולים" }).click();
    await page.getByRole("link", { name: "היסטוריה" }).click();
    await routeCard(page, second.label).getByRole("link", { name: "שכפול נסיעה" }).click();
    await expectCopyOf("08:10", "2", "9", "שנייה");
  });

  test("copying an active one-time ride publishes a new one and keeps the original", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { id: groupId, label } = await namedGroup(seed);
    const route = await seed.route(driver, { groupId, date: israelDate(3), seats: 3, price: 7, time: "06:05", notes: "פעילה" });
    await signIn(page, driver);

    await page.goto("/routes");
    await routeCard(page, label).getByRole("link", { name: "שכפול נסיעה" }).click();
    await expect(page).toHaveURL(new RegExp(`/routes/new\\?copy=${route.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "שכפול נסיעה" })).toBeVisible();
    await expect(page.getByLabel("מקומות פנויים")).toHaveValue("3");
    await expect(page.getByLabel("הערות לטרמפיסטיות")).toHaveValue("פעילה");

    await page.getByRole("button", { name: /^תאריך הנסיעה:/ }).click();
    await page.getByRole("dialog", { name: "תאריך הנסיעה" }).getByRole("button", { name: "החודש הבא" }).click();
    await page.getByRole("dialog", { name: "תאריך הנסיעה" }).locator(".calendar-grid button:not(.outside)").first().click();
    await page.getByLabel("מקומות פנויים").fill("5");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(routeCard(page, label)).toHaveCount(2);
    await expect(routeCard(page, label).filter({ hasText: "3 מקומות" })).toHaveCount(1);
    await expect(routeCard(page, label).filter({ hasText: "5 מקומות" })).toHaveCount(1);
  });

  test("a recurring route can be copied too", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const { id: groupId, label } = await namedGroup(seed);
    await seed.route(driver, { groupId, kind: "recurring", date: null });
    await signIn(page, driver);

    await page.goto("/routes");
    await routeCard(page, label).getByRole("link", { name: "שכפול נסיעה" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "שכפול נסיעה" })).toBeVisible();
    await expect(page.getByRole("button", { name: "נסיעה קבועה" })).toHaveClass(/active/);
  });

  test("only a ride of her own can be copied", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const others = await seed.route(await seed.user("Other"), { date: israelDate(-1) });
    await signIn(page, driver);
    await page.goto(`/routes/new?copy=${others.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "מסלול חדש" })).toBeVisible();
  });

  test("a one-time ride cancelled for its date moves to the cancelled tab, and can only be copied", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const route = await seed.route(driver, { date, seats: 3, notes: "מבוטלת" });
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    await signIn(page, driver);

    await page.goto("/routes?tab=cancelled");
    const card = page.locator(".route-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(card.getByRole("link")).toHaveText(["שכפול נסיעה"]);

    await card.getByRole("link", { name: "שכפול נסיעה" }).click();
    await expect(page).toHaveURL(new RegExp(`/routes/new\\?copy=${route.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "שכפול נסיעה" })).toBeVisible();
    await expect(page.getByLabel("מקומות פנויים")).toHaveValue("3");
    await expect(page.getByLabel("הערות לטרמפיסטיות")).toHaveValue("מבוטלת");

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
