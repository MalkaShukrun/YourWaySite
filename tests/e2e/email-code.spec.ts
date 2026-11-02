import { randomUUID } from "node:crypto";
import { SUPPORT_EMAIL } from "@/lib/site/support";
import { expect, test } from "./support/fixtures";

// Sign-in with a personal code (spec A6, H4).

const openForm = "אין לך חשבון Google? כניסה עם קוד אישי";

test("an admin adds an address and she signs in with her code, again and again", async ({ browser, page, seed, signIn }) => {
  const email = `e2e-otp-${randomUUID().slice(0, 8)}@example.test`;
  const admin = await seed.user("Admin", { admin: true });

  try {
    await signIn(page, admin);
    await page.goto("/admin/groups");
    await page.getByRole("textbox", { name: "כתובת מייל" }).fill(email);
    await page.getByRole("button", { name: "הוספה", exact: true }).click();
    const code = await page.locator(".otp-code-note strong").textContent();
    expect(code).toMatch(/^\d{8}$/);
    await expect(page.getByText(email)).toBeVisible();

    const baseURL = test.info().project.use.baseURL;
    for (const tryWrongFirst of [true, false]) {
      const context = await browser.newContext({ baseURL });
      const visitor = await context.newPage();
      await visitor.goto("/login");
      await visitor.getByRole("checkbox").check();
      await visitor.getByRole("button", { name: openForm }).click();
      await visitor.getByLabel("כתובת המייל").fill(email);
      if (tryWrongFirst) {
        await visitor.getByLabel("הקוד האישי").fill("00000000");
        await visitor.getByRole("button", { name: "כניסה", exact: true }).click();
        await expect(visitor.getByText("המייל או הקוד שגויים.")).toBeVisible();
      }
      await visitor.getByLabel("הקוד האישי").fill(code!);
      await visitor.getByRole("button", { name: "כניסה", exact: true }).click();
      await expect(visitor.getByRole("dialog")).toBeVisible();
      await context.close();
    }
  } finally {
    await seed.service.from("otp_emails").delete().eq("email", email);
    const { data } = await seed.service.from("profiles").select("id").eq("email", email).maybeSingle();
    if (data) await seed.service.auth.admin.deleteUser(data.id);
  }
});

test("an address that isn't on the list gets the same error as a wrong code", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: openForm }).click();
  await page.getByLabel("כתובת המייל").fill("stranger@example.test");
  await page.getByLabel("הקוד האישי").fill("12345678");
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page.getByText("המייל או הקוד שגויים.")).toBeVisible();
});

test("a forgotten code copies the support address", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/login");
  await page.getByRole("button", { name: openForm }).click();
  await page.getByRole("button", { name: "שכחת את הקוד? שלחי לנו מייל" }).click();
  await expect(page.locator(".email-code-note")).toHaveText(`כתובת המייל הועתקה: ${SUPPORT_EMAIL}`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SUPPORT_EMAIL);
});
