import { test as base, expect, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { localSupabase, type LocalSupabase } from "../../local-supabase";
import { createWorld, type Seed, type User } from "../../integration/support/seed";

// Every e2e test gets `seed`, a fresh set of data in the local database
// (removed afterwards), and `signIn`, which signs a page in as one of its users.

let supabase: LocalSupabase | undefined;
const config = () => (supabase ??= localSupabase());

type Fixtures = {
  seed: Seed;
  signIn: (page: Page, user: User) => Promise<void>;
};

export const test = base.extend<Fixtures, { localOnly: void }>({
  // Refuses to run if the app isn't on the local Supabase: its security
  // headers name the Supabase address it talks to.
  localOnly: [
    async ({ playwright }, provide, workerInfo) => {
      const request = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
      const csp = (await request.get("/login")).headers()["content-security-policy"] ?? "";
      await request.dispose();
      if (!csp.includes(config().url)) throw new Error(`The app under test isn't using the local Supabase (${config().url}).`);
      await provide();
    },
    { scope: "worker", auto: true },
  ],

  seed: async ({}, provide) => {
    const seed = createWorld(config());
    await provide(seed);
    await seed.cleanup();
  },

  signIn: async ({ baseURL }, provide) => {
    await provide(async (page, user) => {
      const cookies: { name: string; value: string }[] = [];
      const client = createServerClient(config().url, config().anonKey, {
        cookies: {
          getAll: () => [],
          setAll: (toSet) => {
            cookies.push(...toSet);
          },
        },
      });
      const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
      if (error) throw error;
      await page.context().clearCookies();
      await page.context().addCookies(cookies.filter((c) => c.value).map(({ name, value }) => ({ name, value, url: baseURL! })));
    });
  },
});

export { expect };

// `next dev`'s floating dev-tools button covers the bottom tab bar on phones.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const hide = () => document.head.append(Object.assign(document.createElement("style"), { textContent: "nextjs-portal{display:none!important}" }));
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
});
