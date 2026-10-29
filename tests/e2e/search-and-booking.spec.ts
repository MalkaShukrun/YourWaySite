import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { rideDay, rideDayAfter, type Seed } from "../integration/support/seed";
import { choose, israelDate, shortDate, toast } from "./support/ui";

// Finding and booking a ride (spec C1–C7, B6, H2).

// A group named for this test, so its cards are easy to find.
async function namedGroup(seed: Seed, options: { active?: boolean } = {}) {
  const origin = `E2E ${seed.tag} ${Math.random().toString(36).slice(2, 6)}`;
  const id = await seed.group({ origin, destination: "יעד", ...options });
  return { id, label: `${origin} ← יעד` };
}

const card = (page: Page, label: string) => page.locator(".trip-card").filter({ hasText: label.split(" ← ")[0] });
const bookButton = (page: Page) => page.getByRole("button", { name: /^אישור הרשמה/ });

async function openRide(page: Page, routeId: string, date: string) {
  await page.goto(`/ride/${routeId}?date=${date}`);
  await expect(page.getByRole("heading", { name: "בחרי תחנת איסוף" })).toBeVisible();
}

test.describe("search (spec C1)", () => {
  test("filters by route group, keeps the filters in the address, and shows one card per route", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver", { fullName: "דנה נהגת" });
    const group = await namedGroup(seed);
    await seed.route(driver, { groupId: group.id, kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5], date: null, time: "23:59", price: 15, notes: "מחכה 5 דקות" });
    await signIn(page, await seed.user("Passenger"));

    await page.goto("/");
    await choose(page, "מסלול", group.label);
    await page.getByRole("button", { name: "חיפוש נסיעה" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?group=${group.id}$`));

    const result = card(page, group.label);
    await expect(result).toHaveCount(1); // every date of the route on one card
    await expect(result).toContainText("דנה נהגת");
    await expect(result).toContainText("קבועה");
    await expect(result).toContainText("יציאה ב־23:59");
    await expect(result).toContainText("₪15");
    await expect(result).toContainText("מחכה 5 דקות");
    expect(await result.locator(".trip-dates a").count()).toBeGreaterThanOrEqual(5); // a chip per date in the week
  });

  test("with a date, shows that day only, even beyond the week", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const group = await namedGroup(seed);
    const later = israelDate(20);
    await seed.route(driver, { groupId: group.id, date: later });
    await seed.route(driver, { groupId: group.id, date: israelDate(2), time: "10:00" });
    await signIn(page, await seed.user("Passenger"));

    await page.goto(`/?group=${group.id}`);
    await expect(card(page, group.label)).toHaveCount(1);
    await page.goto(`/?group=${group.id}&date=${later}`);
    await expect(card(page, group.label).locator(".trip-dates")).toContainText(shortDate(later));
  });

  test("filters by ride type and departure time", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const group = await namedGroup(seed);
    const date = israelDate(3);
    await seed.route(driver, { groupId: group.id, date, time: "06:00" });
    await seed.route(driver, { groupId: group.id, date, time: "08:00" });
    await seed.route(driver, { groupId: group.id, kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5], date: null, time: "08:30" });
    await signIn(page, await seed.user("Passenger"));

    await page.goto(`/?group=${group.id}&date=${date}&kind=one_time&from=07%3A00&to=09%3A00`);
    await expect(page.getByRole("button", { name: "יציאה משעה: 07:00" })).toBeVisible();
    const cards = page.locator(".trip-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("יציאה ב־08:00");
    await expect(cards.first()).toContainText("חד־פעמית");
  });

  test("a reversed time range is swapped, and a past date is ignored", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Passenger"));
    await page.goto("/?from=09:00&to=07:00");
    await expect(page.getByRole("button", { name: "יציאה משעה: 07:00" })).toBeVisible();
    await expect(page.getByRole("button", { name: "עד שעה: 09:00" })).toBeVisible();
    await page.goto("/?date=2020-01-01");
    await expect(page.getByRole("button", { name: /^תאריך: כל השבוע/ })).toBeVisible();
  });

  test("says so when nothing matches", async ({ page, seed, signIn }) => {
    const group = await namedGroup(seed);
    await signIn(page, await seed.user("Passenger"));
    await page.goto(`/?group=${group.id}`);
    await expect(page.getByText("לא נמצאו נסיעות מתאימות")).toBeVisible();
  });

  test("never lists departed rides, cancelled dates, removed routes or hidden groups", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const group = await namedGroup(seed);
    const hidden = await namedGroup(seed, { active: false });
    const date = israelDate(2);
    await seed.route(driver, { groupId: group.id, date: israelDate(0), time: "00:00" }); // departed
    await seed.route(driver, { groupId: group.id, date, isActive: false }); // removed
    const cancelled = await seed.route(driver, { groupId: group.id, date });
    await seed.service.from("ride_exceptions").insert({ route_id: cancelled.id, ride_date: date, cancelled: true });
    await seed.route(driver, { groupId: hidden.id, date });
    await signIn(page, await seed.user("Passenger"));

    await page.goto(`/?group=${group.id}`);
    await expect(page.getByText("לא נמצאו נסיעות מתאימות")).toBeVisible();
    // The hidden group isn't even in the filter.
    await page.getByRole("combobox", { name: "מסלול", exact: true }).click();
    await expect(page.getByRole("listbox", { name: "מסלול" }).getByRole("option", { name: hidden.label })).toHaveCount(0);
  });

  test("a full date shows 'מלאה', and a card with every date full can't be opened", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const group = await namedGroup(seed);
    const date = israelDate(3);
    const route = await seed.route(driver, { groupId: group.id, date, seats: 1 });
    await seed.book(await seed.user("Other"), route, date);
    await signIn(page, await seed.user("Passenger"));

    await page.goto(`/?group=${group.id}`);
    const result = card(page, group.label);
    await expect(result.locator(".trip-dates .is-full")).toContainText("מלאה");
    await expect(result.getByText("אין מקום")).toBeVisible();
    await expect(result.getByRole("link", { name: /לפרטים והרשמה/ })).toHaveCount(0);
  });
});

test.describe("the ride page (spec C2)", () => {
  test("shows the ride and driver, hides her contact details, and pre-selects the first stops", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver", { fullName: "דנה נהגת" });
    await seed.service.from("profiles").update({ vehicle_model: "יונדאי", vehicle_color: "לבן", vehicle_seats: 4 }).eq("id", driver.id);
    const date = israelDate(3);
    const route = await seed.route(driver, { date, price: 25, notes: "מחכה 5 דקות" });
    await signIn(page, await seed.user("Passenger"));

    await openRide(page, route.id, date);
    const driverCard = page.locator(".driver-info-card");
    await expect(driverCard).toContainText("דנה נהגת");
    await expect(driverCard).toContainText("הטלפון והדוא״ל של הנהגת יוצגו אחרי ההרשמה לנסיעה.");
    await expect(driverCard).not.toContainText(driver.phone!);
    await expect(page.locator(".vehicle-chip")).toContainText("יונדאי לבן");
    await expect(page.locator(".detail-notes")).toContainText("מחכה 5 דקות");
    await expect(page.locator(".pickup-options [role=radio]").first()).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".dropoff-options [role=radio]").first()).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".booking-summary strong")).toHaveText("₪25");
  });

  // The map shows only stops with pins, and only when there is one (spec B3).
  test("shows the map only when the driver marked a stop on it", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const plain = await seed.route(driver, { date });
    const mapped = await seed.route(driver, { date });
    await seed.service.from("stops").update({ lat: 31.75, lng: 35.0 }).eq("id", mapped.pickup);
    await signIn(page, await seed.user("Passenger"));

    await openRide(page, plain.id, date);
    await expect(page.locator(".map-panel")).toHaveCount(0);
    await openRide(page, mapped.id, date);
    await expect(page.locator(".map-panel .leaflet-container")).toBeVisible();
  });

  test("an unknown ride or a bad date shows not-found (spec C7)", async ({ page, seed, signIn }) => {
    const route = await seed.route(await seed.user("Driver"));
    await signIn(page, await seed.user("Passenger"));
    await page.goto(`/ride/${route.id}?date=not-a-date`);
    await expect(page.getByText("הדף לא נמצא").first()).toBeVisible();
  });
});

test.describe("booking (spec C3, C4)", () => {
  test("books a date: my rides confirms it and the driver's contact details appear", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const group = await namedGroup(seed);
    const date = israelDate(3);
    const route = await seed.route(driver, { groupId: group.id, date, price: 18 });
    await signIn(page, await seed.user("Passenger"));

    await page.goto(`/?group=${group.id}`);
    await card(page, group.label).getByRole("link", { name: /לפרטים והרשמה/ }).click();
    await expect(page).toHaveURL(new RegExp(`/ride/${route.id}\\?date=${date}$`));
    await bookButton(page).click();

    await expect(page).toHaveURL(/\/my-rides\?booked=1$/);
    await expect(toast(page, "הנסיעה נוספה בהצלחה לנסיעות שלי")).toBeVisible();
    const row = page.locator(".activity-row").filter({ hasText: group.label });
    await expect(row).toContainText("₪18");
    await expect(row).toContainText("איסוף: Pickup A");
    await expect(row).toContainText("הורדה: Dropoff B");
    await expect(row).toContainText(driver.phone!);

    // The ride page now says she's booked, with her driver's details.
    await openRide(page, route.id, date);
    await expect(page.locator(".booked-link")).toContainText("את רשומה לנסיעה");
    await expect(page.locator(".driver-contact-links")).toContainText(driver.phone!);
    await expect(page.locator(".driver-contact-links")).toContainText(driver.email);
    await expect(bookButton(page)).toHaveCount(0);
  });

  test("books several dates of a recurring route together", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const [d1, d2] = [rideDay(1), rideDayAfter(rideDay(1))];
    const route = await seed.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5], date: null, price: 10 });
    await signIn(page, await seed.user("Passenger"));

    await openRide(page, route.id, d1);
    await expect(page.getByRole("heading", { name: "בחרי ימים" })).toBeVisible();
    await page.locator(".trip-dates button").filter({ hasText: shortDate(d2) }).click();
    await expect(page.locator(".booking-summary strong")).toHaveText("₪20");
    await page.getByRole("button", { name: "אישור הרשמה ל־2 ימים" }).click();

    await expect(page).toHaveURL(/\/my-rides\?booked=1$/);
    await expect(page.locator(".activity-row")).toHaveCount(2);

    // Booked dates show "רשומה" and can't be picked again.
    await openRide(page, route.id, d1);
    await expect(page.locator(".trip-dates .is-full").filter({ hasText: "רשומה" })).toHaveCount(2);
  });

  test("when some dates can't be booked, keeps the others and says which failed and why", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const [d1, d2] = [rideDay(1), rideDayAfter(rideDay(1))];
    const route = await seed.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5], date: null, seats: 1 });
    await signIn(page, await seed.user("Passenger"));

    await openRide(page, route.id, d1);
    await page.locator(".trip-dates button").filter({ hasText: shortDate(d2) }).click();
    // Someone takes d2's only seat while the page is open.
    await seed.book(await seed.user("Faster"), route, d2);
    await page.getByRole("button", { name: "אישור הרשמה ל־2 ימים" }).click();

    await expect(page.locator(".auth-error")).toHaveText(
      `נרשמת ל־1 מתוך 2 הימים. לא נרשמת ל: ${shortDate(d2)} — הנסיעה התמלאה — אין יותר מקומות פנויים.`,
    );
    await page.goto("/my-rides");
    await expect(page.locator(".activity-row")).toHaveCount(1);
  });
});

test.describe("when booking isn't possible (spec C6, B6, H2)", () => {
  test("a full ride says so on the button", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const route = await seed.route(driver, { date, seats: 1 });
    await seed.book(await seed.user("Other"), route, date);
    await signIn(page, await seed.user("Passenger"));
    await openRide(page, route.id, date);
    await expect(page.getByRole("button", { name: "הנסיעה מלאה" })).toBeDisabled();
  });

  test("a ride cancelled while the page was open can't be booked", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const route = await seed.route(driver, { date });
    await signIn(page, await seed.user("Passenger"));
    await openRide(page, route.id, date);
    await seed.service.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    await bookButton(page).click();
    await expect(page.locator(".auth-error")).toHaveText("הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה).");

    await page.reload();
    await expect(page.getByRole("button", { name: "הנסיעה אינה זמינה" })).toBeDisabled();
  });

  test("a ride in a hidden group, opened from a saved link, isn't available", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const date = israelDate(3);
    const group = await namedGroup(seed, { active: false });
    const route = await seed.route(driver, { groupId: group.id, date });
    await signIn(page, await seed.user("Passenger"));
    await openRide(page, route.id, date);
    await expect(page.getByRole("button", { name: "הנסיעה אינה זמינה" })).toBeDisabled();
  });

  test("a departed ride isn't available", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const yesterday = israelDate(-1);
    const route = await seed.route(driver, { date: yesterday });
    await signIn(page, await seed.user("Passenger"));
    await openRide(page, route.id, yesterday);
    await expect(page.getByRole("button", { name: "הנסיעה אינה זמינה" })).toBeDisabled();
  });

  // B6: the driver sees her own ride as passengers do, but can't book it.
  test("the driver finds her own ride marked as hers, and can only view it", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const group = await namedGroup(seed);
    const date = israelDate(3);
    await seed.route(driver, { groupId: group.id, date });
    await signIn(page, driver);

    await page.goto(`/?group=${group.id}`);
    const own = card(page, group.label);
    await expect(own).toContainText("הנסיעה שלך");
    await own.getByRole("link", { name: /צפייה בנסיעה/ }).click();
    await expect(page.getByText("זו הנסיעה שלך · כך רואות אותה הטרמפיסטיות")).toBeVisible();
    await expect(bookButton(page)).toHaveCount(0);
    await page.getByRole("link", { name: "למסלולים שלי" }).click();
    await expect(page).toHaveURL(/\/routes$/);
  });
});
