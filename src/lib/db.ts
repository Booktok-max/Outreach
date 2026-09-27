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

  // Prisma's default interactive-transaction timeout is 5s. That is fine for a
  // local socket but too short for a remote/managed database over a pooler, where
  // a single commit legitimately performs many sequential round trips. The value
  // is overridable (the database test suite raises it) without changing the
  // default behaviour.
  const timeout = Number(process.env.PRISMA_TRANSACTION_TIMEOUT_MS ?? 5000);
  const transactionOptions = Number.isFinite(timeout) && timeout > 0 ? { timeout } : undefined;

  return new PrismaClient({
    adapter,
    ...(transactionOptions ? { transactionOptions } : {}),
    log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (getEnv().NODE_ENV !== "production") {
  // Reuse the connection pool across hot reloads in development.
  globalForPrisma.prisma = prisma;
}
