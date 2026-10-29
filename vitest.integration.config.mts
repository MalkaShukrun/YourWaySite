// Integration tests (npm run test:integration): tests/integration/**/*.test.ts
// against a local Supabase (npx supabase start, needs Docker). They sign in as
// real users and call the database the way the browser does, so they check the
// database's own rules: permissions, functions, triggers and constraints.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    // The files share one database; one at a time keeps seat counts and totals predictable.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
