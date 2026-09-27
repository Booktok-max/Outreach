import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma ORM 7 configuration.
 *
 * The datasource URL lives here (instead of `schema.prisma`) so that no
 * credentials are ever committed to the repository.
 */
const databaseUrl =
  process.env.PRISMA_USE_TEST_DATABASE === "1" && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL
    : env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
