import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit test configuration. Unit tests never touch the network or a database.
 * Database integration tests live in `tests/db` and run via `npm run test:db`.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/db/**", "node_modules/**"],
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
