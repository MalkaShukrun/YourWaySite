import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { choose, chooseTime, expectNotFound, hideDevTools, isAdmin, nextWeekday, openForm, toast } from "./helpers";

// Tests that SAVE data, against the real Supabase project. They only run with
// E2E_WRITE=1 (npm run test:e2e:write) and as an admin, and touch only things
// they create themselves:
//   - a ride group "בדיקה ← E2E <stamp>" with one route in it. The route is
//     removed at the end and the group hidden (a group a route ever used
//     can't be deleted), so neither shows up for anyone.
//   - a second group, created and deleted.
//   - your profile is saved with its existing values.
//   - one of your payments is marked paid/unpaid and set back.
// Booking is tested against the test route itself (drivers can't book their
// own ride), so no other driver's ride is touched. A real booking needs a
// second account: npm run test:e2e:login:passenger.

const PASSENGER_AUTH_FILE = "e2e/.auth/passenger.json";

test.describe.configure({ mode: "serial" });
test.beforeEach(({ page }) => hideDevTools(page));

const stamp = Date.now().toString().slice(-6);
const origin = "בדיקה";
let destination = `E2E ${stamp}`;
const label = () => `${origin} ← ${destination}`;
let routeId = "";

const groupRow = (page: Page) => page.locator(".group-row").filter({ hasText: label() });
const routeCard = (page: Page) => page.locator(".route-card").filter({ hasText: label() });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  const admin = await isAdmin(page);
  await page.close();
  test.skip(!admin, "The write suite creates ride groups, so it needs an admin");
});

test.describe("admin: groups", () => {
  test("creates a city-to-city group", async ({ page }) => {
    await page.goto("/admin/groups");
    await page.getByRole("button", { name: "קבוצה חדשה" }).click();
    const dialog = page.getByRole("dialog", { name: "יצירת קבוצת נסיעה" });
    await dialog.getByLabel("נקודת מוצא").fill(origin);
    await dialog.getByLabel("יעד").fill(destination);
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();

    await expect(toast(page, "הקבוצה נוצרה בהצלחה")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(groupRow(page)).toContainText("אין מסלולים פעילים");
    await expect(groupRow(page).locator(".status-pill")).toHaveText("פעילה");
  });

  test("refuses a duplicate group", async ({ page }) => {
    await page.goto("/admin/groups");
    await page.getByRole("button", { name: "קבוצה חדשה" }).click();
    const dialog = page.getByRole("dialog", { name: "יצירת קבוצת נסיעה" });
    await dialog.getByLabel("נקודת מוצא").fill(origin);
    await dialog.getByLabel("יעד").fill(destination);
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();

    await expect(dialog.getByRole("alert")).toHaveText("הקבוצה הזו כבר קיימת.");
    await expect(groupRow(page)).toHaveCount(1);
  });

  test("renames the group", async ({ page }) => {
    await page.goto("/admin/groups");
    await groupRow(page).getByRole("button", { name: "עריכה" }).click();
    destination = `E2E ${stamp}ב`;
    const dialog = page.getByRole("dialog", { name: "עריכת קבוצת נסיעה" });
    await dialog.getByLabel("יעד").fill(destination);
    await dialog.getByRole("button", { name: "שמירת השינויים" }).click();

    await expect(toast(page, "הקבוצה עודכנה")).toBeVisible();
    await expect(groupRow(page)).toHaveCount(1);
  });

  test("hides and shows the group", async ({ page }) => {
    await page.goto("/admin/groups");
    await groupRow(page).getByRole("button", { name: "הסתרה" }).click();
    await expect(groupRow(page).locator(".status-pill")).toHaveText("מוסתרת");

    await page.goto("/");
    await page.getByRole("button", { name: /^מסלול:/ }).click();
    await expect(page.getByRole("option", { name: label() })).toHaveCount(0);

    await page.goto("/admin/groups");
    await groupRow(page).getByRole("button", { name: "הצגה" }).click();
    await expect(groupRow(page).locator(".status-pill")).toHaveText("פעילה");
  });

  test("deletes an unused group after confirming", async ({ page }) => {
    const spare = `E2E ${stamp}מ`;
    await page.goto("/admin/groups");
    await page.getByRole("button", { name: "קבוצה חדשה" }).click();
    const dialog = page.getByRole("dialog", { name: "יצירת קבוצת נסיעה" });
    await dialog.getByLabel("נקודת מוצא").fill(origin);
    await dialog.getByLabel("יעד").fill(spare);
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();

    const row = page.locator(".group-row").filter({ hasText: `${origin} ← ${spare}` });
    await row.getByRole("button", { name: "מחיקה" }).click();
    await expect(row.getByText("למחוק את הקבוצה?")).toBeVisible();
    await row.getByRole("button", { name: "כן, למחוק" }).click();
    await expect(row).toHaveCount(0);
  });
});

test.describe("driver: route lifecycle", () => {
  test("adds a route with stops on the map", async ({ page }) => {
    await openForm(page, "/routes/new", "שמירת המסלול");
    await choose(page, "קבוצת נסיעה", label());

    const days = page.getByRole("group", { name: "ימים בשבוע" }).getByRole("button");
    for (let i = 0; i < 6; i++) {
      if ((await days.nth(i).getAttribute("aria-pressed")) !== "true") await days.nth(i).click();
    }
    await chooseTime(page, "שעת יציאה", "06:05");
    await page.getByLabel("מקומות פנויים").fill("3");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("7");

    const map = page.locator(".leaflet-container");
    await expect(map).toBeVisible();
    const box = (await map.boundingBox())!;

    // The pickup is marked on the map, the dropoff only has a name.
    await page.getByRole("button", { name: "הוספת תחנת איסוף" }).click();
    await page.locator(".editor-stop-group:not(.dropoff-editor-group) input").last().fill("תחנת בדיקה א");
    await page.getByRole("button", { name: "סימון על המפה" }).last().click();
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.4);

    await page.getByRole("button", { name: "הוספת תחנת הורדה" }).click();
    await page.locator(".dropoff-editor-group input").last().fill("תחנת בדיקה ב");

    await expect(page.locator(".leaflet-stop-pin")).toHaveCount(1);
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(toast(page, "המסלול נשמר ופורסם")).toBeVisible();
    await expect(routeCard(page)).toContainText("יציאה ב־06:05");
    await expect(routeCard(page)).toContainText("3 מקומות · ₪7 לטרמפיסטית");
    await expect(routeCard(page)).toContainText("א׳ · ב׳ · ג׳ · ד׳ · ה׳ · ו׳");

    routeId = (await routeCard(page).getByRole("link", { name: "עריכת מסלול" }).getAttribute("href"))!.split("/").pop()!;
  });

  test("a stop without a name blocks saving", async ({ page }) => {
    await openForm(page, `/routes/${routeId}`, "שמירת המסלול");
    await page.locator(".editor-stop-group:not(.dropoff-editor-group) input").first().fill("");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();
    await expect(page.locator(".form-alert")).toHaveText("יש לתת שם לכל תחנה");
  });

  test("updates the route", async ({ page }) => {
    await openForm(page, `/routes/${routeId}`, "שמירת המסלול");
    await expect(page.getByRole("heading", { level: 1, name: "עריכת מסלול" })).toBeVisible();
    await expect(page.getByLabel("מקומות פנויים")).toHaveValue("3");
    await expect(page.locator(".editor-stop-group:not(.dropoff-editor-group) input")).toHaveValue("תחנת בדיקה א");

    await page.getByLabel("מחיר לכל טרמפיסטית").fill("9");
    await chooseTime(page, "שעת יציאה", "06:10");
    await page.locator(".dropoff-editor-group input").first().fill("תחנת בדיקה ג");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(page).toHaveURL(/\/routes\?saved=1$/);
    await expect(routeCard(page)).toContainText("₪9 לטרמפיסטית");
    await expect(routeCard(page)).toContainText("יציאה ב־06:10");
    await expect(routeCard(page)).toHaveCount(1); // updated, not duplicated
  });

  test("the dashboard shows the route on its day; time change and per-date cancel", async ({ page }) => {
    const date = nextWeekday();
    await page.goto(`/dashboard?date=${date}`);
    const card = page.locator(".today-card").filter({ hasText: label() });
    await expect(card.getByRole("button", { name: "שעת יציאה: 06:10" })).toBeVisible();
    await expect(card.locator(".status-pill")).toHaveCount(0);

    await chooseTime(card, "שעת יציאה", "06:40");
    await card.getByRole("button", { name: "עדכון שעה" }).click();
    await expect(toast(page, "שעת היציאה עודכנה ל־06:40")).toBeVisible();
    await expect(card.getByRole("button", { name: "שעת יציאה: 06:40" })).toBeVisible();

    await card.getByRole("button", { name: "ביטול הנסיעה לתאריך זה בלבד" }).click();
    await expect(card.locator(".status-pill")).toHaveText("בוטלה לתאריך זה");
    await expect(card.getByLabel("שעת יציאה")).toBeDisabled();

    await card.getByRole("button", { name: "החזרת הנסיעה" }).click();
    await expect(card.locator(".status-pill")).toHaveCount(0);
  });

  test("the time change applies to that date only", async ({ page }) => {
    const date = nextWeekday();
    let other = date;
    for (let i = 1; other === date || new Date(`${other}T12:00:00Z`).getUTCDay() === 6; i++) {
      other = new Date(Date.parse(`${date}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    }
    await page.goto(`/dashboard?date=${other}`);
    await expect(page.locator(".today-card").filter({ hasText: label() }).getByRole("button", { name: "שעת יציאה: 06:10" })).toBeVisible();
  });

  test("your own route is hidden from search and can't be booked", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(`.trip-card a[href^="/ride/${routeId}"]`)).toHaveCount(0);

    await page.goto(`/ride/${routeId}?date=${nextWeekday()}`);
    await expect(page.getByRole("heading", { name: "בחרי תחנת איסוף" })).toBeVisible();
    await page.getByRole("button", { name: "אישור הרשמה לנסיעה" }).click();
    await expect(page.locator(".auth-error")).toHaveText("אי אפשר להירשם לנסיעה שאת נוהגת בה.");
  });

  test("a passenger books the route, sees it in my rides and cancels", async ({ browser }) => {
    test.skip(!existsSync(PASSENGER_AUTH_FILE), "Needs a second account: npm run test:e2e:login:passenger");
    const context = await browser.newContext({ storageState: PASSENGER_AUTH_FILE });
    const page = await context.newPage();
    await hideDevTools(page);
    const date = nextWeekday();

    await page.goto(`/ride/${routeId}?date=${date}`);
    test.skip(page.url().includes("/login"), "The passenger account hasn't finished sign-up");
    await expect(page.getByRole("heading", { name: "בחרי תחנת איסוף" })).toBeVisible();
    await page.getByRole("button", { name: "אישור הרשמה לנסיעה" }).click();

    await expect(page).toHaveURL(/\/my-rides\?booked=1$/);
    await expect(toast(page, "הנסיעה נוספה בהצלחה")).toBeVisible();
    const row = page.locator(".activity-row").filter({ hasText: label() });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("06:40"); // that date's changed time, not the route's 06:10
    await expect(row).toContainText("₪9");
    await expect(row).toContainText("איסוף: תחנת בדיקה א");
    await expect(row).toContainText("הורדה: תחנת בדיקה ג");

    // The booked day can't be picked again.
    await page.goto(`/ride/${routeId}?date=${date}`);
    await expect(page.locator('.trip-dates .is-full[aria-label$="את רשומה"]')).toHaveCount(1);

    await page.goto("/my-rides");
    await row.getByRole("button", { name: "ביטול" }).click();
    await expect(row).toHaveCount(0);
    await page.reload();
    await expect(row).toHaveCount(0);
    await context.close();
  });

  test("cancels the route, then adds a new one in its place", async ({ page }) => {
    await page.goto("/routes");
    await routeCard(page).getByRole("button", { name: "הסרת המסלול" }).click();
    await routeCard(page).getByRole("button", { name: "כן, להסיר" }).click();
    await expect(routeCard(page)).toHaveCount(0);

    await page.goto(`/routes/${routeId}`);
    await expectNotFound(page); // a removed route can't be edited

    // A replacement route in the same group — without touching the map at all.
    await openForm(page, "/routes/new", "שמירת המסלול");
    await choose(page, "קבוצת נסיעה", label());
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("5");
    await page.getByRole("button", { name: "הוספת תחנת איסוף" }).click();
    await page.locator(".editor-stop-group:not(.dropoff-editor-group) input").last().fill("תחנה חדשה א");
    await page.getByRole("button", { name: "הוספת תחנת הורדה" }).click();
    await page.locator(".dropoff-editor-group input").last().fill("תחנה חדשה ב");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(routeCard(page)).toHaveCount(1);
    await expect(routeCard(page)).toContainText("₪5 לטרמפיסטית");
    const newId = (await routeCard(page).getByRole("link", { name: "עריכת מסלול" }).getAttribute("href"))!.split("/").pop();
    expect(newId).not.toBe(routeId);
    routeId = newId!;
  });

  test("cleanup: removes the route and hides the test group", async ({ page }) => {
    await page.goto("/routes");
    await routeCard(page).getByRole("button", { name: "הסרת המסלול" }).click();
    await routeCard(page).getByRole("button", { name: "כן, להסיר" }).click();
    await expect(routeCard(page)).toHaveCount(0);

    await page.goto("/admin/groups");
    await expect(groupRow(page).getByRole("button", { name: "מחיקה" })).toHaveCount(0); // a route used it
    await groupRow(page).getByRole("button", { name: "הסתרה" }).click();
    await expect(groupRow(page).locator(".status-pill")).toHaveText("מוסתרת");
  });
});

test.describe("profile", () => {
  test("saves the profile and keeps the values after reload", async ({ page }) => {
    await openForm(page, "/profile", "שמירת שינויים");
    const name = await page.getByLabel("שם מלא").inputValue();
    const phone = await page.getByLabel("מספר טלפון").inputValue();

    await page.getByRole("button", { name: "שמירת שינויים" }).click();
    await expect(toast(page, "הפרטים נשמרו בהצלחה")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("שם מלא")).toHaveValue(name);
    await expect(page.getByLabel("מספר טלפון")).toHaveValue(phone);
  });
});

test.describe("payments", () => {
  test("marking a ride paid is saved, and can be undone", async ({ page }) => {
    await page.goto("/payments");
    const pill = page.locator(".paid-pill").first();
    test.skip((await pill.count()) === 0, "No payments this month");
    const before = await pill.getAttribute("aria-pressed");
    const after = before === "true" ? "false" : "true";

    await pill.click();
    await expect(pill).toHaveAttribute("aria-pressed", after);
    await page.reload();
    await expect(pill).toHaveAttribute("aria-pressed", after);

    await pill.click(); // set it back
    await expect(pill).toHaveAttribute("aria-pressed", before!);
    await page.reload();
    await expect(pill).toHaveAttribute("aria-pressed", before!);
  });
});

// Signing out ends the session on every device (Supabase's default), so the
// saved test session stops working too. Only with E2E_SIGNOUT=1; afterwards
// run `npm run test:e2e:login` again.
test("signs out and clears the session", async ({ page }) => {
  test.skip(!process.env.E2E_SIGNOUT, "Set E2E_SIGNOUT=1 to sign out for real");
  await page.goto("/");
  await page.locator(".header-user").click();
  await page.getByRole("button", { name: "התנתקות" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/my-rides");
  await expect(page).toHaveURL(/\/login$/);
});
