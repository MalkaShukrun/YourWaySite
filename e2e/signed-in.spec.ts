import { expect, test } from "@playwright/test";
import { choose, expectNotFound, hideDevTools, isAdmin, israelToday, openForm, optionsOf, sideNav, trackPageErrors } from "./helpers";

test.beforeEach(({ page }) => hideDevTools(page));

// Runs with the session saved by `npm run test:e2e:login`. Everything here
// only reads or fills forms without saving — it runs against the real
// Supabase project. Tests that save data are in write.spec.ts.

test.describe("every page loads", () => {
  const pages = [
    { path: "/", heading: "בואי נמצא לך טרמפ" },
    { path: "/my-rides", heading: "הנסיעות שלי" },
    { path: "/payments", heading: "מעקב תשלומים" },
    { path: "/dashboard", heading: /הנסיעות שלך/ },
    { path: "/routes", heading: "המסלולים שלי" },
    { path: "/routes/new", heading: "מסלול חדש" },
    { path: "/profile", heading: "הפרופיל שלי" },
  ];

  for (const { path, heading } of pages) {
    test(`${path}`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await page.goto(path);

      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText("לא הצלחנו לטעון את הנתונים")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("access control", () => {
  test("the login page sends a signed-in user on", async ({ page }) => {
    await page.goto("/login");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("/admin/groups is admin-only", async ({ page }) => {
    const admin = await isAdmin(page);
    await page.goto("/admin/groups");
    if (admin) {
      await expect(page.getByRole("heading", { level: 1, name: "ניהול קבוצות נסיעה" })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("unknown ride and route ids show the 404 page", async ({ page }) => {
    await page.goto(`/ride/00000000-0000-4000-8000-000000000000?date=${israelToday()}`);
    await expectNotFound(page);
    await page.goto("/ride/not-a-ride?date=2026-01-01");
    await expectNotFound(page);
    await page.goto("/routes/00000000-0000-4000-8000-000000000000");
    await expectNotFound(page);
  });
});

test.describe("profile", () => {
  test("loads the saved details with a read-only email", async ({ page }) => {
    await openForm(page, "/profile", "שמירת שינויים");

    await expect(page.getByLabel("שם מלא")).not.toHaveValue("");
    await expect(page.getByLabel("מספר טלפון")).toHaveValue(/^0\d/);
    const email = page.getByLabel("כתובת דוא״ל");
    await expect(email).toHaveValue(/@/);
    await expect(email).toHaveAttribute("readonly", "");
  });

  test("validates the name and phone before saving", async ({ page }) => {
    await openForm(page, "/profile", "שמירת שינויים");
    await page.getByLabel("שם מלא").fill("א");
    await page.getByLabel("מספר טלפון").fill("12345");
    await page.getByRole("button", { name: "שמירת שינויים" }).click();

    await expect(page.getByText("יש להזין שם מלא")).toBeVisible();
    await expect(page.getByText("מספר טלפון לא תקין (לדוגמה 050-000-0000)")).toBeVisible();
    await expect(page.locator(".toast")).toHaveCount(0);
  });

  test("requires all bank fields once one is filled", async ({ page }) => {
    await openForm(page, "/profile", "שמירת שינויים");
    for (const label of ["שם בעלת החשבון", "שם הבנק", "מספר סניף", "מספר חשבון"]) await page.getByLabel(label).fill("");
    await page.getByLabel("שם הבנק").fill("בנק הפועלים");
    await page.getByLabel("מספר סניף").fill("12345");
    await page.getByRole("button", { name: "שמירת שינויים" }).click();

    await expect(page.getByText("יש להזין שם", { exact: true })).toBeVisible();
    await expect(page.getByText("עד 4 ספרות")).toBeVisible();
    await expect(page.getByText("מספר חשבון לא תקין")).toBeVisible();
  });

  test("adding and removing the car shows and hides its fields", async ({ page }) => {
    await openForm(page, "/profile", "שמירת שינויים");
    const remove = page.getByRole("button", { name: "הסרת הרכב" });
    if (await remove.isVisible()) await remove.click();

    await expect(page.getByLabel("סוג רכב")).toHaveCount(0);
    await page.getByRole("button", { name: "הוספת רכב" }).click();
    await expect(page.getByLabel("סוג רכב")).toBeVisible();
    await expect(page.getByLabel("צבע")).toBeVisible();
    await expect(page.getByLabel("מספר מקומות")).toBeVisible();

    await page.getByLabel("מספר מקומות").fill("9");
    await page.getByRole("button", { name: "שמירת שינויים" }).click();
    await expect(page.getByText("בין 1 ל־8 מקומות")).toBeVisible();
  });
});

test.describe("admin: group management", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await isAdmin(page)), "Signed-in user isn't an admin");
  });

  test("the side menu shows group management", async ({ page }) => {
    await page.goto("/dashboard");
    await sideNav(page).getByRole("link", { name: "ניהול קבוצות" }).click();
    await expect(page).toHaveURL(/\/admin\/groups$/);
  });

  test("shows the stats and the group list", async ({ page }) => {
    await page.goto("/admin/groups");
    for (const label of ["קבוצות פעילות", "נהגות עם מסלולים", "מסלולים פעילים"]) {
      await expect(page.locator(".stat-card").filter({ hasText: label })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "כל הקבוצות" })).toBeVisible();
  });

  test("'קבוצה חדשה' opens the dialog, which validates and closes", async ({ page }) => {
    await page.goto("/admin/groups");
    await page.getByRole("button", { name: "קבוצה חדשה" }).click();

    const dialog = page.getByRole("dialog", { name: "יצירת קבוצת נסיעה" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("נקודת מוצא")).toBeFocused();

    await dialog.getByLabel("נקודת מוצא").fill("ירושלים");
    await dialog.getByLabel("יעד").fill("ירושלים");
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();
    await expect(dialog.getByText("היעד חייב להיות שונה מנקודת המוצא")).toBeVisible();

    await dialog.getByLabel("יעד").fill("א");
    await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();
    await expect(dialog.getByText("לפחות 2 תווים")).toBeVisible();

    await dialog.getByRole("button", { name: "סגירה" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("the edit dialog opens with the group's current names", async ({ page }) => {
    await page.goto("/admin/groups");
    const row = page.locator(".group-row").first();
    test.skip((await row.count()) === 0, "No groups yet");
    const [origin, destination] = (await row.locator("strong").innerText()).split(" ← ");

    await row.getByRole("button", { name: "עריכה" }).click();
    const dialog = page.getByRole("dialog", { name: "עריכת קבוצת נסיעה" });
    await expect(dialog.getByLabel("נקודת מוצא")).toHaveValue(origin);
    await expect(dialog.getByLabel("יעד")).toHaveValue(destination);

    // Clicking the backdrop closes it without saving.
    await page.locator(".modal-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("ride search", () => {
  test("filtering by route puts it in the URL and shows the result count", async ({ page }) => {
    await page.goto("/");
    const groups = (await optionsOf(page, "מסלול")).filter((o) => o !== "כל המסלולים");
    test.skip(groups.length === 0, "No ride groups");

    await choose(page, "מסלול", groups[0]);
    await page.getByRole("button", { name: "חיפוש נסיעה" }).click();

    await expect(page).toHaveURL(/\?group=[0-9a-f-]{36}$/);
    await expect(page.locator(".results-head span")).toHaveText(/^\d+ תוצאות$/);
    await expect(page.getByRole("button", { name: `מסלול: ${groups[0]}` })).toBeVisible();
  });

  test("time window and ride type filters", async ({ page }) => {
    await page.goto("/");
    await choose(page, "שעת יציאה", "07:30–09:00");
    await choose(page, "סוג נסיעה", "נסיעות קבועות");
    await page.getByRole("button", { name: "חיפוש נסיעה" }).click();

    await expect(page).toHaveURL(/time=morning/);
    await expect(page).toHaveURL(/kind=recurring/);
    for (const card of await page.locator(".trip-card").all()) {
      await expect(card.locator(".trip-type")).toHaveText("קבועה");
    }
  });

  test("the date picker can't go before today and filters by the picked day", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^תאריך:/ }).click();

    const calendar = page.getByRole("dialog", { name: "תאריך" });
    await expect(calendar.getByRole("button", { name: "החודש הקודם" })).toBeDisabled();
    await calendar.locator(".calendar-grid button:not([disabled]):not(.outside)").nth(1).click();
    await page.getByRole("button", { name: "חיפוש נסיעה" }).click();

    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
    const date = new URL(page.url()).searchParams.get("date")!;
    expect(date > israelToday()).toBe(true);
  });

  test("a date in the past is ignored", async ({ page }) => {
    await page.goto("/?date=2020-01-01");
    await expect(page.getByRole("button", { name: /^תאריך: כל השבוע/ })).toBeVisible();
  });

  test("only rides from today on are listed (server time)", async ({ page }) => {
    await page.goto("/");
    const today = israelToday();
    for (const link of await page.locator(".trip-card a.btn-primary").all()) {
      const date = new URL((await link.getAttribute("href"))!, "http://x").searchParams.get("date")!;
      expect(date >= today).toBe(true);
    }
  });

  test("the filter bar fits the screen with the calendar open", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^תאריך:/ }).click();

    const calendar = await page.getByRole("dialog", { name: "תאריך" }).boundingBox();
    const viewport = page.viewportSize()!;
    expect(calendar!.x).toBeGreaterThanOrEqual(0);
    expect(calendar!.x + calendar!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    const route = await page.getByRole("button", { name: /^מסלול:/ }).boundingBox();
    const time = await page.getByRole("button", { name: /^שעת יציאה:/ }).boundingBox();
    expect(route!.width).toBeGreaterThan(time!.width); // the route field is the wide one
  });
});

test.describe("ride details", () => {
  test("opens from a result card with stops, price, map and the booking button", async ({ page }) => {
    await page.goto("/");
    const card = page.locator(".trip-card").filter({ has: page.locator("a.btn-primary") }).first();
    test.skip((await card.count()) === 0, "No open rides to look at");

    const price = await card.locator(".trip-price b").innerText();
    await card.getByRole("link", { name: /לפרטים והרשמה/ }).click();

    await expect(page).toHaveURL(/\/ride\/[0-9a-f-]{36}\?date=\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole("heading", { name: "בחרי תחנת איסוף" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "בחרי תחנת הורדה" })).toBeVisible();
    await expect(page.locator(".booking-summary strong")).toHaveText(price);
    await expect(page.locator(".leaflet-container, .map-empty").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "אישור הרשמה לנסיעה" }).or(page.getByRole("link", { name: /את רשומה לנסיעה/ })),
    ).toBeVisible();
  });

  test("picking another stop moves the selection", async ({ page }) => {
    await page.goto("/");
    const link = page.locator(".trip-card a.btn-primary").first();
    test.skip((await link.count()) === 0, "No open rides");
    await link.click();

    const pickups = page.locator(".pickup-options [role=radio]");
    test.skip((await pickups.count()) < 2, "Ride has a single pickup stop");
    await expect(pickups.first()).toHaveAttribute("aria-checked", "true");
    await pickups.nth(1).click();
    await expect(pickups.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(pickups.first()).toHaveAttribute("aria-checked", "false");
  });

  test("a ride you're already booked on can't be booked again", async ({ page }) => {
    await page.goto("/");
    const links = await page.locator(".trip-card a.btn-primary").evaluateAll((as) => as.slice(0, 8).map((a) => a.getAttribute("href")!));
    for (const href of links) {
      await page.goto(href);
      const booked = page.getByRole("link", { name: /את רשומה לנסיעה/ });
      if (await booked.isVisible()) {
        await expect(page.getByRole("button", { name: "אישור הרשמה לנסיעה" })).toHaveCount(0);
        return;
      }
    }
    test.skip(true, "Not booked on any of the listed rides");
  });
});

test.describe("my rides & payments", () => {
  test("switches between upcoming and history", async ({ page }) => {
    await page.goto("/my-rides");
    await expect(page.getByRole("heading", { name: "הנסיעות הקרובות שלי" })).toBeVisible();
    await expect(page.locator(".count-pill")).toHaveText(/^\d+ נסיעות$/);

    await page.getByRole("link", { name: "היסטוריה" }).click();
    await expect(page).toHaveURL(/tab=history/);
    await expect(page.getByRole("heading", { name: "נסיעות קודמות" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ביטול" })).toHaveCount(0); // past rides can't be cancelled
  });

  test("upcoming bookings can be cancelled and show the stops", async ({ page }) => {
    await page.goto("/my-rides");
    const rows = page.locator(".activity-row:not(.row-cancelled)");
    test.skip((await rows.count()) === 0, "No upcoming bookings");
    await expect(rows.first().getByRole("button", { name: "ביטול" })).toBeVisible();
    await expect(rows.first()).toContainText("איסוף:");
    await expect(rows.first()).toContainText("הורדה:");
  });

  test("the empty state links to the search", async ({ page }) => {
    await page.goto("/my-rides");
    const empty = page.getByText("אין לך נסיעות קרובות");
    test.skip(!(await empty.isVisible()), "There are upcoming bookings");
    await page.getByRole("link", { name: "מציאת נסיעה" }).last().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the booked=1 toast confirms a new booking", async ({ page }) => {
    await page.goto("/my-rides?booked=1");
    await expect(page.locator(".toast")).toHaveText(/הנסיעה נוספה בהצלחה/);
  });

  test("payments: the summary adds up and the month filter changes the URL", async ({ page }) => {
    await page.goto("/payments");
    const amounts = await page.locator(".payment-summary strong").allInnerTexts();
    const [total, paid, left] = amounts.map((a) => Number(a.replace(/[₪,]/g, "")));
    expect(total - paid).toBeCloseTo(left, 2);

    const months = await optionsOf(page, "חודש");
    expect(months).toHaveLength(4);
    await choose(page, "חודש", months[1]);
    await expect(page).toHaveURL(/month=\d{4}-\d{2}$/);
    await expect(page.getByRole("button", { name: `חודש: ${months[1]}` })).toBeVisible();
  });

  test("payments: an unknown month falls back to this month", async ({ page }) => {
    await page.goto("/payments?month=1999-01");
    const months = await optionsOf(page, "חודש");
    await expect(page.getByRole("button", { name: `חודש: ${months[0]}` })).toBeVisible();
  });
});

test.describe("driver hub", () => {
  test("dashboard shows the four stats and moves between dates", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "הנסיעות שלך להיום" })).toBeVisible();
    for (const label of ["טרמפיסטיות רשומות", "מקומות פנויים", "תחנות איסוף", "שעת יציאה"]) {
      await expect(page.locator(".stat-card").filter({ hasText: label })).toBeVisible();
    }

    await page.getByRole("button", { name: /^בחירת תאריך:/ }).click();
    await page.locator(".calendar-grid button:not(.outside):not(.today)").last().click();
    await expect(page).toHaveURL(/\/dashboard\?date=\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^הנסיעות שלך ל/);
  });

  test("dashboard ride cards have time and per-date controls", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.locator(".today-card").first();
    test.skip((await card.count()) === 0, "No rides today");
    await expect(card.getByLabel("שעת יציאה")).toBeVisible();
    await expect(card.getByRole("button", { name: "עדכון שעה" })).toBeDisabled(); // unchanged time
    await expect(card.getByRole("button", { name: /ביטול הנסיעה לתאריך זה בלבד|החזרת הנסיעה/ })).toBeVisible();
  });

  test("'נסיעה חדשה' and 'הוספת מסלול' open the route editor", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "נסיעה חדשה" }).click();
    await expect(page).toHaveURL(/\/routes\/new$/);
    await page.goto("/routes");
    await page.getByRole("link", { name: "הוספת מסלול" }).click();
    await expect(page).toHaveURL(/\/routes\/new$/);
  });

  test("route editor: sections, days, one-time date and cancel", async ({ page }) => {
    await openForm(page, "/routes/new", "שמירת המסלול");
    for (const name of ["פרטי הנסיעה", "ימים ושעות", "תחנות איסוף והורדה", "סימון המסלול על המפה"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }

    const days = page.getByRole("group", { name: "ימים בשבוע" }).getByRole("button");
    await expect(days).toHaveCount(6); // Sunday–Friday
    await expect(days.nth(0)).toHaveAttribute("aria-pressed", "true");
    await days.nth(1).click();
    await expect(days.nth(1)).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "נסיעה חד־פעמית" }).click();
    await expect(page.getByRole("group", { name: "ימים בשבוע" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^תאריך הנסיעה:/ })).toBeVisible();

    await page.getByRole("link", { name: "ביטול" }).click();
    await expect(page).toHaveURL(/\/routes$/);
  });

  test("route editor: won't save without stops and asks for them", async ({ page }) => {
    let posted = false;
    page.on("request", (r) => r.method() === "POST" && r.url().includes("/routes/new") && (posted = true));
    await openForm(page, "/routes/new", "שמירת המסלול");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("10");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();

    await expect(page.locator(".form-alert")).toHaveText(/יש להוסיף לפחות תחנת איסוף אחת|יש לבחור קבוצת נסיעה/);
    expect(posted).toBe(false);
  });

  test("route editor: bad seats, price and time are rejected", async ({ page }) => {
    await openForm(page, "/routes/new", "שמירת המסלול");
    await page.getByLabel("מקומות פנויים").fill("9");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();
    await expect(page.locator(".form-alert")).toBeVisible();

    await page.getByLabel("מקומות פנויים").fill("3");
    await page.getByLabel("מחיר לכל טרמפיסטית").fill("abc");
    await page.getByRole("button", { name: "שמירת המסלול" }).click();
    await expect(page.locator(".form-alert")).toHaveText(/מחיר לא תקין|יש לבחור קבוצת נסיעה/);
  });

  test("route editor: the map is limited to the group's two cities", async ({ page }) => {
    await openForm(page, "/routes/new", "שמירת המסלול");
    const known = (await optionsOf(page, "קבוצת נסיעה")).find((o) =>
      /^(בית שמש|רמת בית שמש|ירושלים|הר חוצבים) ← (בית שמש|רמת בית שמש|ירושלים|הר חוצבים)$/.test(o),
    );
    test.skip(!known, "No group between two mapped places");

    await choose(page, "קבוצת נסיעה", known!);
    const map = page.locator(".leaflet-container");
    await expect(map).toBeVisible();
    // At the area's zoom level the map can't zoom out any further.
    await expect(page.locator(".leaflet-control-zoom-out")).toHaveClass(/leaflet-disabled/);
  });

  test("route editor: stops are added without the map; the pin button marks one on it", async ({ page }) => {
    await openForm(page, "/routes/new", "שמירת המסלול");
    await expect(page.locator(".optional-tag")).toHaveText("לא חובה");

    await page.getByRole("button", { name: "הוספת תחנת איסוף" }).click();
    const name = page.locator(".editor-stop-group:not(.dropoff-editor-group) input").last();
    await expect(name).toBeFocused();
    await expect(page.locator(".map-hint")).toHaveCount(0); // the map isn't needed

    const pin = page.getByRole("button", { name: "סימון על המפה" }).last();
    await pin.click();
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".map-hint")).toContainText("לחצי על המפה במקום תחנת האיסוף");

    const box = (await page.locator(".leaflet-container").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(".leaflet-stop-pin")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "שינוי המיקום על המפה" })).toBeVisible();
    await expect(page.locator(".map-hint")).toHaveCount(0);
  });

  test("routes: removing asks for confirmation, and cancelling keeps the route", async ({ page }) => {
    await page.goto("/routes");
    const card = page.locator(".route-card").first();
    test.skip((await card.count()) === 0, "No routes");
    await card.getByRole("button", { name: "הסרת המסלול" }).click();
    await expect(card.getByText("להסיר את המסלול?")).toBeVisible();
    await card.getByRole("button", { name: "ביטול" }).click();
    await expect(card.getByRole("button", { name: "הסרת המסלול" })).toBeVisible();
  });

  test("routes: editing opens the saved values", async ({ page }) => {
    await page.goto("/routes");
    const card = page.locator(".route-card").first();
    test.skip((await card.count()) === 0, "No routes");
    const title = await card.getByRole("heading", { level: 2 }).innerText();

    await card.getByRole("link", { name: "עריכת מסלול" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "עריכת מסלול" })).toBeVisible();
    await expect(page.getByRole("button", { name: `קבוצת נסיעה: ${title}` })).toBeVisible();
    await expect(page.getByLabel("מחיר לכל טרמפיסטית")).not.toHaveValue("");
  });
});

test.describe("navigation", () => {
  test("side menu reaches every passenger page", async ({ page }) => {
    await page.goto("/");
    const nav = sideNav(page);
    await expect(nav.locator(".nav-label")).toHaveText("אזור טרמפיסטית");
    for (const [name, url] of [["הנסיעות שלי", /\/my-rides$/], ["מעקב תשלומים", /\/payments$/], ["הפרופיל שלי", /\/profile$/], ["מציאת נסיעה", /\/$/]] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
      await expect(nav.getByRole("link", { name })).toHaveClass(/active/);
    }
  });

  test("the role switch flips between passenger and driver menus", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("group", { name: "בחירת מצב" }).getByRole("link", { name: "אני הנהגת" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const nav = sideNav(page);
    await expect(nav.locator(".nav-label")).toHaveText("אזור נהגת");
    await expect(nav.getByRole("link", { name: "המסלולים שלי" })).toBeVisible();

    await page.getByRole("group", { name: "בחירת מצב" }).getByRole("link", { name: "אני הטרמפיסטית" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(nav.locator(".nav-label")).toHaveText("אזור טרמפיסטית");
  });

  test("shared pages keep the last mode", async ({ page }) => {
    await page.goto("/dashboard");
    await sideNav(page).getByRole("link", { name: "הפרופיל שלי" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(sideNav(page).locator(".nav-label")).toHaveText("אזור נהגת");
  });

  test("the user menu offers sign-out", async ({ page }) => {
    await page.goto("/");
    const menu = page.locator(".header-user");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(page.getByRole("button", { name: "התנתקות" })).toBeVisible();
    // Clicking outside closes it. (Signing out for real is in write.spec.ts.)
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("button", { name: "התנתקות" })).toHaveCount(0);
  });

  test("the help link points to the support email", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-help a")).toHaveAttribute("href", /^mailto:.+@.+/);
  });
});
