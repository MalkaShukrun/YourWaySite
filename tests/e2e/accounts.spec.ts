import { expect, test } from "./support/fixtures";
import { expectNotFound, openForm, sideNav, toast } from "./support/ui";

// Accounts (spec A1, A3–A5, §1 Modes, I1): onboarding, the profile, the two
// modes, signing out, the contact form and who may open what.

test.describe("onboarding (spec A1)", () => {
  test("a new user is asked for her phone before anything else, then lands on search", async ({ page, seed, signIn }) => {
    const user = await seed.user("Newbie", { phone: null, fullName: "רחל חדשה" });
    await signIn(page, user);

    // Every signed-in page sends her back to onboarding until a phone is saved.
    await page.goto("/my-rides");
    await expect(page).toHaveURL(/\/login$/);
    const dialog = page.getByRole("dialog", { name: "עוד רגע ואת בדרך" });
    await expect(dialog.getByLabel("שם מלא")).toHaveValue("רחל חדשה");
    await expect(dialog.getByRole("button", { name: "שמירה וכניסה למערכת" })).toBeEnabled();

    await dialog.getByLabel("מספר טלפון").fill("12345");
    await dialog.getByRole("button", { name: "שמירה וכניסה למערכת" }).click();
    await expect(dialog.getByText("מספר טלפון לא תקין (לדוגמה 050-000-0000)")).toBeVisible();

    await dialog.getByLabel("מספר טלפון").fill("050-123-4567");
    await dialog.getByRole("button", { name: "שמירה וכניסה למערכת" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const { data } = await seed.service.from("profiles").select("phone").eq("id", user.id).single();
    expect(data!.phone).toBe("050-123-4567");
  });

  test("car details are optional, but complete once a car is added", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Newbie", { phone: null }));
    await page.goto("/login");
    const dialog = page.getByRole("dialog", { name: "עוד רגע ואת בדרך" });
    await expect(dialog.getByRole("button", { name: "שמירה וכניסה למערכת" })).toBeEnabled();

    await dialog.getByRole("button", { name: "הוספת רכב" }).click();
    await dialog.getByLabel("מספר טלפון").fill("050-123-4567");
    await dialog.getByRole("button", { name: "שמירה וכניסה למערכת" }).click();
    await expect(dialog.getByText("יש להזין סוג רכב")).toBeVisible();

    await dialog.getByRole("button", { name: "בלי רכב כרגע" }).click();
    await dialog.getByRole("button", { name: "שמירה וכניסה למערכת" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("an admin lands on group management", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("NewAdmin", { phone: null, admin: true }));
    await page.goto("/login");
    const dialog = page.getByRole("dialog", { name: "עוד רגע ואת בדרך" });
    await expect(dialog.getByRole("button", { name: "שמירה וכניסה למערכת" })).toBeEnabled();
    await dialog.getByLabel("מספר טלפון").fill("050-123-4567");
    await dialog.getByRole("button", { name: "שמירה וכניסה למערכת" }).click();
    await expect(page).toHaveURL(/\/admin\/groups$/);
  });

  test("'not you?' signs out to sign in with another account", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Newbie", { phone: null }));
    await page.goto("/login");
    await page.getByRole("button", { name: "לא את? התחברות עם חשבון אחר" }).click();
    await expect(page.getByRole("dialog", { name: "עוד רגע ואת בדרך" })).toHaveCount(0);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a signed-in user who opens sign-in goes straight to her home", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Done"));
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("profile (spec A3)", () => {
  test("shows her details with a read-only email, saves changes and keeps them", async ({ page, seed, signIn }) => {
    const user = await seed.user("Profile", { fullName: "רחל לוי" });
    await signIn(page, user);
    await openForm(page, "/profile", "שמירת שינויים");

    await expect(page.getByLabel("שם מלא")).toHaveValue("רחל לוי");
    await expect(page.getByLabel("מספר טלפון")).toHaveValue(user.phone!);
    await expect(page.getByLabel("כתובת דוא״ל")).toHaveValue(user.email);
    await expect(page.getByLabel("כתובת דוא״ל")).toHaveAttribute("readonly", "");

    await page.getByLabel("שם מלא").fill("רחל כהן");
    await page.getByLabel("מספר טלפון").fill("052-765-4321");
    await page.getByRole("button", { name: "הוספת רכב" }).click();
    await page.getByLabel("סוג רכב").fill("יונדאי איוניק");
    await page.getByLabel("צבע").fill("לבן");
    await page.getByLabel("מספר מקומות").fill("4");
    await page.getByRole("button", { name: "שמירת שינויים" }).click();
    await expect(toast(page, "הפרטים נשמרו בהצלחה")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("שם מלא")).toHaveValue("רחל כהן");
    await expect(page.getByLabel("מספר טלפון")).toHaveValue("052-765-4321");
    await expect(page.getByLabel("סוג רכב")).toHaveValue("יונדאי איוניק");
  });

  test("checks the name, phone and car before saving", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Profile"));
    await openForm(page, "/profile", "שמירת שינויים");
    await page.getByLabel("שם מלא").fill("א");
    await page.getByLabel("מספר טלפון").fill("12345");
    await page.getByRole("button", { name: "הוספת רכב" }).click();
    await page.getByLabel("מספר מקומות").fill("9");
    await page.getByRole("button", { name: "שמירת שינויים" }).click();

    await expect(page.getByText("יש להזין שם מלא")).toBeVisible();
    await expect(page.getByText("מספר טלפון לא תקין (לדוגמה 050-000-0000)")).toBeVisible();
    await expect(page.getByText("בין 1 ל־8 מקומות")).toBeVisible();
    await expect(page.locator(".toast")).toHaveCount(0);
  });

  test("removing the car clears it", async ({ page, seed, signIn }) => {
    const user = await seed.user("WithCar");
    await seed.service.from("profiles").update({ vehicle_model: "יונדאי", vehicle_color: "לבן", vehicle_seats: 4 }).eq("id", user.id);
    await signIn(page, user);
    await openForm(page, "/profile", "שמירת שינויים");
    await page.getByRole("button", { name: "הסרת הרכב" }).click();
    await expect(page.getByLabel("סוג רכב")).toHaveCount(0);
    await page.getByRole("button", { name: "שמירת שינויים" }).click();
    await expect(toast(page, "הפרטים נשמרו בהצלחה")).toBeVisible();
    const { data } = await seed.service.from("profiles").select("vehicle_model, vehicle_seats").eq("id", user.id).single();
    expect(data).toEqual({ vehicle_model: null, vehicle_seats: null });
  });
});

test.describe("modes (spec §1, A4)", () => {
  test("the mode switch flips between the passenger and driver menus", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Both"));
    await page.goto("/");
    await expect(sideNav(page).locator(".nav-label")).toHaveText("אזור טרמפיסטית");
    for (const name of ["מציאת נסיעה", "הנסיעות שלי", "מעקב תשלומים"]) await expect(sideNav(page).getByRole("link", { name })).toBeVisible();

    await page.getByRole("group", { name: "בחירת מצב" }).getByRole("link", { name: "אני הנהגת" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(sideNav(page).locator(".nav-label")).toHaveText("אזור נהגת");
    for (const name of ["לוח נהגת שבועי", "המסלולים שלי"]) await expect(sideNav(page).getByRole("link", { name })).toBeVisible();

    await page.getByRole("group", { name: "בחירת מצב" }).getByRole("link", { name: "אני הטרמפיסטית" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("opening a page of the other mode switches to it; the profile keeps the last mode", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Both"));
    await page.goto("/routes");
    await expect(sideNav(page).locator(".nav-label")).toHaveText("אזור נהגת");
    await sideNav(page).getByRole("link", { name: "הפרופיל שלי" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(sideNav(page).locator(".nav-label")).toHaveText("אזור נהגת");

    await page.goto("/payments");
    await page.goto("/profile");
    await expect(sideNav(page).locator(".nav-label")).toHaveText("אזור טרמפיסטית");
  });

  test("the side menu reaches every passenger page", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Passenger"));
    await page.goto("/");
    for (const [name, url] of [["הנסיעות שלי", /\/my-rides$/], ["מעקב תשלומים", /\/payments$/], ["הפרופיל שלי", /\/profile$/], ["מציאת נסיעה", /\/$/]] as const) {
      await sideNav(page).getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
      await expect(sideNav(page).getByRole("link", { name })).toHaveClass(/active/);
    }
  });
});

test.describe("access (spec §1, §3)", () => {
  test("group management is for admins only", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Regular"));
    await page.goto("/profile");
    await expect(sideNav(page).getByRole("link", { name: "ניהול קבוצות" })).toHaveCount(0);
    await page.goto("/admin/groups");
    await expect(page).toHaveURL(/\/$/);
  });

  test("an admin sees group management in the menu", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Admin", { admin: true }));
    await page.goto("/dashboard");
    await sideNav(page).getByRole("link", { name: "ניהול קבוצות" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "ניהול קבוצות נסיעה" })).toBeVisible();
  });

  test("unknown pages, rides and routes show the not-found page", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Lost"));
    for (const path of ["/no-such-page", "/ride/00000000-0000-4000-8000-000000000000?date=2030-01-01", "/ride/not-a-ride?date=2030-01-01", "/routes/00000000-0000-4000-8000-000000000000"]) {
      await page.goto(path);
      await expectNotFound(page);
    }
  });

  // Another driver's route can't be opened for editing.
  test("another driver's route can't be edited", async ({ page, seed, signIn }) => {
    const driver = await seed.user("Driver");
    const route = await seed.route(driver);
    await signIn(page, await seed.user("Other"));
    await page.goto(`/routes/${route.id}`);
    await expectNotFound(page);
  });
});

// Sign-out removes the session and returns to sign-in (spec A5).
test("signing out ends the session", async ({ page, seed, signIn }) => {
  await signIn(page, await seed.user("Leaving"));
  await page.goto("/");
  await page.locator(".header-user").click();
  await page.getByRole("button", { name: "התנתקות" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/my-rides");
  await expect(page).toHaveURL(/\/login$/);
});

// The contact form (spec I1). Nothing reaches a real inbox: the test server's
// Resend key is fake, so a send fails with the general error.
test.describe("contact form", () => {
  test("checks the fields, and shows a general error when sending fails", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Asking"));
    await page.goto("/");
    await page.getByRole("button", { name: "צרי קשר" }).click();
    const dialog = page.getByRole("dialog", { name: "צרי קשר" });
    await expect(dialog.getByLabel("שם")).toBeFocused();

    await dialog.getByLabel("מייל").fill("not-an-email");
    await dialog.getByRole("button", { name: "שליחה" }).click();
    await expect(dialog.getByText("כתובת מייל לא תקינה")).toBeVisible();

    await dialog.getByLabel("שם").fill("רחל");
    await dialog.getByLabel("מייל").fill("rachel@example.test");
    await dialog.getByLabel("הודעה").fill("שלום, יש לי שאלה");
    await dialog.getByRole("button", { name: "שליחה" }).click();
    await expect(dialog.getByText("משהו השתבש. נסי שוב בעוד רגע.")).toBeVisible();
  });

  test("closing throws the draft away", async ({ page, seed, signIn }) => {
    await signIn(page, await seed.user("Asking"));
    await page.goto("/");
    await page.getByRole("button", { name: "צרי קשר" }).click();
    const dialog = page.getByRole("dialog", { name: "צרי קשר" });
    await dialog.getByLabel("שם").fill("רחל");
    await dialog.getByRole("button", { name: "סגירה" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "צרי קשר" }).click();
    await expect(dialog.getByLabel("שם")).toHaveValue("");
  });
});
