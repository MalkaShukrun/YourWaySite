// Real email test (npm run test:email): tests/email/**/*.test.ts. Sends actual
// emails with the keys in .env.local, so it stays out of the other test runs.
// Unit tests: vitest.config.mts.
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/email/**/*.test.ts"],
    env: loadEnv("test", process.cwd(), ""),
    testTimeout: 20_000,
  },
});
