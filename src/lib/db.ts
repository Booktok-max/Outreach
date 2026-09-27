import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

import { getEnv } from "./env";

/**
 * Single Prisma client instance.
 *
 * Prisma ORM 7 runs without the Rust query engine; a driver adapter (node-postgres)
 * provides the connection pool. The generated client lives in `src/generated/prisma`
 * and is committed to .gitignore - run `npm run db:generate` after cloning.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const { DATABASE_URL, NODE_ENV } = getEnv();

  const adapter = new PrismaPg({ connectionString: DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (getEnv().NODE_ENV !== "production") {
  // Reuse the connection pool across hot reloads in development.
  globalForPrisma.prisma = prisma;
}
