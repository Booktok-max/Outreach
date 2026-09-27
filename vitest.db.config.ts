import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Database integration test configuration.
 *
 * These tests run against a real PostgreSQL database. They are skipped
 * automatically when no test database is configured. The test database is
 * reset (migrations applied from scratch) before the suite runs - never point
 * TEST_DATABASE_URL at a database you care about.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    setupFiles: ["tests/db/setup-env.ts"],
    fileParallelism: false,
    // These tests run against a remote, pooled PostgreSQL instance, so a single
    // test performs many sequential round trips. 60s is not enough headroom for
    // the full import pipeline on a cold/remote database.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
