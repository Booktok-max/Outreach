/**
 * Runs before every database test file.
 *
 * The application reads its connection from DATABASE_URL (src/lib/db.ts), so
 * pointing DATABASE_URL at the dedicated test database is what makes the whole
 * persistence layer talk to the test database. Import order matters: this file
 * must be a `setupFiles` entry so it executes before any test module imports
 * `@/lib/db`.
 *
 * No connection string is ever logged.
 */
import { config } from "dotenv";

config({ path: ".env", quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is not configured - refusing to run database tests.");
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL equals DATABASE_URL - refusing to run tests against the application database.",
  );
}

// The app's Prisma client is built from DATABASE_URL; redirect it to the
// dedicated test database. ADMIN_* values are irrelevant here but are required
// by the env schema, so harmless placeholders are supplied when absent.
const env = process.env as Record<string, string | undefined>;
env.DATABASE_URL = testUrl;
env.PRISMA_USE_TEST_DATABASE = "1";
env.NODE_ENV = "test";
env.ADMIN_USERNAME ??= "db-test-operator";
env.ADMIN_PASSWORD ??= "db-test-password";
env.SESSION_SECRET ??= "db-test-session-secret-value-0000";
// The dedicated test database is remote and pooled, so a single commit performs
// many sequential round trips. Prisma's 5s default interactive-transaction
// timeout is far too tight for that; raise it for the test run only.
env.PRISMA_TRANSACTION_TIMEOUT_MS ??= "60000";
