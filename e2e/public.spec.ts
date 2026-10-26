import { expect, test } from "@playwright/test";

// Pages and redirects for visitors who aren't signed in.

// .auth-error, not role=alert: Next adds its own hidden alert (the route announcer).
test.describe("login page", () => {
  test("shows the brand, the Google button and the privacy link", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveTitle("התחברות · בדרך שלך");
    await expect(page.getByRole("heading", { name: /הדרך שלך/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "הצטרפות עם Google" })).toBeVisible();
    await expect(page.getByRole("link", { name: "מדיניות הפרטיות" })).toBeVisible();
  });

  test("has a support email link", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('a[href^="mailto:"]').first()).toHaveAttribute("href", /^mailto:.+@.+/);
  });

  test("shows a sign-in error, but not the text from the URL", async ({ page }) => {
    await page.goto("/login?error=invalid%20grant");

    const alert = page.locator(".auth-error");
    await expect(alert).toHaveText("ההתחברות לא הושלמה. נסי שוב.");
  });

  test("shows no error without one", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".auth-error")).toHaveCount(0);
  });

  test("the Google button starts the OAuth flow", async ({ page }) => {
    await page.goto("/login");
    // Stop at the first hop so the test never reaches Google itself. Abort, not
    // an empty response: a 204 never finishes the navigation, so click() hangs.
    await page.route(/supabase\.co\/auth\/v1\/authorize/, (route) => route.abort());
    const authorize = page.waitForRequest(/supabase\.co\/auth\/v1\/authorize/);

    await page.getByRole("button", { name: "הצטרפות עם Google" }).click();

    const url = new URL((await authorize).url());
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
  });
});

test.describe("privacy page", () => {
  test("is public and links back to login", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "מדיניות פרטיות" })).toBeVisible();
    await page.getByRole("link", { name: /חזרה להתחברות/ }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("is reachable from the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "מדיניות הפרטיות" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});

test.describe("signed-out redirects", () => {
  for (const path of ["/", "/my-rides", "/payments", "/dashboard", "/routes", "/routes/new", "/profile", "/admin/groups"]) {
    test(`${path} sends visitors to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL("http://localhost:3000/login");
    });
  }

  test("drops the query string on the way to /login", async ({ page }) => {
    await page.goto("/routes?saved=1");
    await expect(page).toHaveURL("http://localhost:3000/login");
  });

  test("a stray OAuth error lands on the login page with an error", async ({ page }) => {
    await page.goto("/?error=access_denied&error_description=User%20cancelled");
    await expect(page).toHaveURL(/\/login\?error=User%20cancelled$/);
    await expect(page.locator(".auth-error")).toHaveText("ההתחברות לא הושלמה. נסי שוב.");
  });

  test("the callback without a code reports it", async ({ page }) => {
    await page.goto("/auth/callback");
    await expect(page).toHaveURL(/\/login\?error=missing%20code$/);
  });
});

test("pages render without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/login");
  await page.goto("/privacy");

  expect(errors).toEqual([]);
});
