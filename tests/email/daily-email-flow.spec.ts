import { CRON_SECRET } from "../../playwright.email.config";
import { localSupabase } from "../local-supabase";
import { weekdayOf } from "../integration/support/seed";
import { expect, test } from "../e2e/support/fixtures";
import { choose, chooseTime, israelDate, openForm, toast } from "../e2e/support/ui";

// The whole daily email: a driver publishes a ride, a passenger books tomorrow,
// the driver turns the email on, and the real Edge Function sends it through
// Gmail. The driver's address is EMAIL_TEST_TO, so the email really arrives.

const tomorrow = israelDate(1);

test("the driver gets tomorrow's passenger by email", async ({ browser, page, seed, signIn }) => {
  test.skip(weekdayOf(tomorrow) === 6, "No rides run on Saturday");
  const to = process.env.EMAIL_TEST_TO;
  if (!to) throw new Error("Set EMAIL_TEST_TO in .env.local");

  const origin = `בדיקה ${seed.tag}`;
  const groupId = await seed.group({ origin, destination: "ירושלים" });
  // Admins only, for now (spec D7).
  const driver = await seed.user("Driver", { fullName: "נהגת לבדיקה", admin: true });
  await signIn(page, driver);

  // The driver publishes a recurring route, Sunday to Friday.
  await openForm(page, "/routes/new", "שמירת המסלול");
  await choose(page, "קבוצת נסיעה", `${origin} ← ירושלים`);
  const days = page.getByRole("group", { name: "ימים בשבוע" }).getByRole("button");
  for (let i = 0; i < 6; i++) {
    if ((await days.nth(i).getAttribute("aria-pressed")) !== "true") await days.nth(i).click();
  }
  await chooseTime(page, "שעת יציאה", "23:55");
  await page.getByLabel("מקומות פנויים").fill("3");
  await page.getByLabel("מחיר לכל טרמפיסטית").fill("10");
  await page.getByRole("button", { name: "הוספת תחנת איסוף" }).click();
  await page.locator(".editor-stop-group:not(.dropoff-editor-group) input").last().fill("תחנה מרכזית");
  await page.getByRole("button", { name: "הוספת תחנת הורדה" }).click();
  await page.locator(".dropoff-editor-group input").last().fill("גבעת שאול");
  await page.getByRole("button", { name: "שמירת המסלול" }).click();
  await expect(page).toHaveURL(/\/routes\?saved=1$/);

  // A passenger finds it and books tomorrow.
  const passengerPage = await browser.newContext().then((context) => context.newPage());
  await signIn(passengerPage, await seed.user("Passenger", { fullName: "נוסעת לבדיקה" }));
  await passengerPage.goto(`/?group=${groupId}&date=${tomorrow}`);
  await passengerPage.locator(".trip-card").filter({ hasText: origin }).getByRole("link", { name: /לפרטים והרשמה/ }).click();
  await expect(passengerPage).toHaveURL(new RegExp(`date=${tomorrow}$`));
  await passengerPage.getByRole("button", { name: /^אישור הרשמה/ }).click();
  await expect(passengerPage).toHaveURL(/\/my-rides\?booked=1$/);
  await passengerPage.context().close();

  // The driver turns the email on, with a time that has already passed.
  await openForm(page, "/profile", "שמירת הגדרות המייל");
  await page.getByRole("button", { name: "כבוי", exact: true }).click();
  await chooseTime(page, "שעת השליחה", "00:00");
  await page.getByRole("button", { name: "שמירת הגדרות המייל" }).click();
  await expect(toast(page, "הגדרות המייל נשמרו")).toBeVisible();

  // Her address comes from auth.users; the update refreshes the profile's copy.
  const moved = await seed.service.auth.admin.updateUserById(driver.id, { email: to, email_confirm: true });
  expect(moved.error).toBeNull();
  await seed.service.from("profiles").update({ daily_email_enabled: true }).eq("id", driver.id);

  // What pg_cron does every 5 minutes.
  const response = await fetch(`${localSupabase().url}/functions/v1/daily-passenger-email`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(await response.json()).toEqual({ sent: 1, failed: 0 });

  const { data } = await seed.service.from("profiles").select("email, daily_email_sent_for").eq("id", driver.id).single();
  expect(data).toEqual({ email: to, daily_email_sent_for: tomorrow });
});
