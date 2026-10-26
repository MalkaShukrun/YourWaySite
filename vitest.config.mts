// Unit tests: every *.test.ts under tests/, mirroring the source layout.
// Browser tests live in e2e/ and run separately with Playwright.
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    exclude: ["node_modules", ".next"],
  },
});
