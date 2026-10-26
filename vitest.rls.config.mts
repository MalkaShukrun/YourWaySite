// RLS tests: rls/*.test.ts against a local Supabase (npx supabase start).
// They sign in as real users and call the database the way a browser could,
// so they check the policies themselves, not the app's own checks.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["rls/**/*.test.ts"],
    globalSetup: ["./rls/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
