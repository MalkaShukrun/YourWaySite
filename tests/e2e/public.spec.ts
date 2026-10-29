import { expect, test } from "./support/fixtures";
import { pageErrors } from "./support/ui";

// Signed-out visitors (spec A2, §3): sign-in, the privacy policy, the
// not-found page, and redirects away from everything else.

test.describe("sign-in page", () => {
  test("shows the brand, the Google button, the consent and the privacy link", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("התחברות · בדרך שלך");
    await expect(page.getByRole("heading", { name: /הדרך שלך/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "הצטרפות עם Google" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /מדיניות הפרטיות/ })).not.toBeChecked();
    await expect(page.getByRole("link", { name: "מדיניות הפרטיות" })).toBeVisible();
  });

  test("offers Google only: no email or password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "הצטרפות עם Google" })).toBeVisible();
    await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  });

  // The contact form is for signed-in users only (spec I1).
  test("has no contact button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "הצטרפות עם Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "צרי קשר" })).toHaveCount(0);
  });

  // Site totals for everyone (spec §3, §5).
  test("shows the site's totals as whole numbers", async ({ page }) => {
    await page.goto("/login");
    const stats = page.getByRole("region", { name: "בדרך שלך במספרים" });
    for (const label of ["משתמשות במערכת", "מסלולים פעילים"]) {
      await expect(stats.getByRole("listitem").filter({ hasText: label }).locator("strong")).toHaveText(/^[\d,]+$/);
    }
  });

  test("asks to accept the privacy policy before going to Google", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "הצטרפות עם Google" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".auth-error")).toHaveText("יש לאשר את מדיניות הפרטיות כדי להמשיך.");
  });

  test("starts Google sign-in once the policy is accepted, returning to the callback", async ({ page, baseURL }) => {
    await page.goto("/login");
    // Stop at the first hop, so the test never reaches Google.
    await page.route(/\/auth\/v1\/authorize/, (route) => route.abort());
    const authorize = page.waitForRequest(/\/auth\/v1\/authorize/);
    await page.getByRole("checkbox", { name: /מדיניות הפרטיות/ }).check();
    await page.getByRole("button", { name: "הצטרפות עם Google" }).click();

    const url = new URL((await authorize).url());
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe(`${baseURL}/auth/callback`);
  });

  // If Google sign-in fails, the reason is shown — but never text from the address (spec A1).
  test("shows a sign-in failure without repeating the address's text", async ({ page }) => {
    await page.goto("/login?error=%3Cb%3Eyou%20were%20hacked%3C%2Fb%3E");
    await expect(page.locator(".auth-error")).toHaveText("ההתחברות לא הושלמה. נסי שוב.");
    await expect(page.getByText("you were hacked")).toHaveCount(0);
  });

  test("shows no error without one", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "הצטרפות עם Google" })).toBeVisible();
    await expect(page.locator(".auth-error")).toHaveCount(0);
  });
});

test.describe("privacy policy", () => {
  test("is open to visitors and links back to sign-in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "מדיניות הפרטיות" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "מדיניות פרטיות" })).toBeVisible();
    await page.getByRole("link", { name: /חזרה להתחברות/ }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("signed-out redirects (spec A2)", () => {
  for (const path of ["/", "/my-rides", "/payments", "/dashboard", "/routes", "/routes/new", "/profile", "/admin/groups", "/ride/00000000-0000-4000-8000-000000000000?date=2030-01-01"]) {
    test(`${path} sends visitors to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("a Google error that lands on the home page shows on sign-in", async ({ page }) => {
    await page.goto("/?error=access_denied&error_description=User%20cancelled");
    await expect(page).toHaveURL(/\/login\?error=User%20cancelled$/);
    await expect(page.locator(".auth-error")).toHaveText("ההתחברות לא הושלמה. נסי שוב.");
  });

  test("the callback without a code reports it", async ({ page }) => {
    await page.goto("/auth/callback");
    await expect(page).toHaveURL(/\/login\?error=missing%20code$/);
  });
});

test("sign-in and privacy pages load without errors", async ({ page }) => {
  const errors = pageErrors(page);
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await page.goto("/login");
  await page.goto("/privacy");
  expect(errors).toEqual([]);
});
