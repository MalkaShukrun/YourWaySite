// Unit tests (npm test): tests/unit/**/*.test.ts. Pure logic and server code
// with Next and Supabase replaced by stand-ins — no database, no browser.
// Integration tests: vitest.integration.config.mts. E2E: playwright.config.ts.
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/unit/setup.ts"],
  },
});
