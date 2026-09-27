/**
 * Test database bootstrap.
 *
 * Resolves the dedicated test database exactly the way prisma.config.ts does
 * (dotenv, so the LAST definition of TEST_DATABASE_URL in .env wins) and makes
 * the Prisma CLI apply migrations to THAT database only.
 *
 * Safety rules enforced here:
 *  - Refuses to run when TEST_DATABASE_URL is missing.
 *  - Refuses to run when the resolved test database is the same as the app
 *    DATABASE_URL, so the app/production database can never be reset.
 *  - Never prints a connection string.
 *
 * Migrations are applied with `migrate deploy` (additive, forward only). The
 * test database is emptied between test files with TRUNCATE, never with
 * `migrate reset`, so nothing outside the test tables is ever dropped.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env", quiet: true });

export function setup(): void {
  const testUrl = process.env.TEST_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;

  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not configured. Database integration tests cannot run. " +
        "Set TEST_DATABASE_URL in .env to a dedicated, disposable PostgreSQL database.",
    );
  }

  if (identity(testUrl) && identity(testUrl) === identity(appUrl)) {
    throw new Error(
      "TEST_DATABASE_URL resolves to the same database as DATABASE_URL. Refusing to run: " +
        "database tests must never touch the application database.",
    );
  }

  const testIdentity = identity(testUrl);
  console.log(
    `[db-tests] using dedicated test database (${testIdentity?.split("|")[0] ?? "unknown-host"} / ` +
      `${testIdentity?.split("|")[2] ?? "unknown-db"})`,
  );

  applyMigrations(testUrl);
}

/** host|port|database, used only to prove the test DB is not the app DB. */
function identity(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}|${url.port || "5432"}|${url.pathname.replace(/^\//, "")}`;
  } catch {
    return null;
  }
}

/**
 * Applies migrations to the test database only. DATABASE_URL is overridden as a
 * second layer of protection so prisma.config.ts cannot fall back to it.
 * The Prisma CLI entrypoint is invoked through `node` directly: `npx` is a
 * shell script and is not spawnable on Windows.
 */
function applyMigrations(testUrl: string): void {
  const entrypoints = [
    "node_modules/prisma/build/build/index.js",
    "node_modules/prisma/build/index.js",
  ];
  const prismaEntry = entrypoints.find((candidate) => existsSync(candidate));
  if (!prismaEntry) {
    throw new Error("Could not locate the Prisma CLI entrypoint in node_modules.");
  }
  const cli: string = prismaEntry;

  const cliEnv = {
    ...process.env,
    PRISMA_USE_TEST_DATABASE: "1",
    TEST_DATABASE_URL: testUrl,
    DATABASE_URL: testUrl,
  };

  function runPrisma(args: string[], attempt = 1): ReturnType<typeof spawnSync> {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      env: cliEnv,
      encoding: "utf8",
    });

    // Neon poolers are autoscaled and can refuse a connection (P1001) or accept
    // it but time out while the instance wakes up (P1002). Retry with backoff;
    // nothing about the schema is touched.
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const transient = output.includes("P1001") || output.includes("P1002");
    if (result.status !== 0 && transient && attempt < 6) {
      const waitMs = 3000 * attempt;
      console.log(`[db-tests] database not reachable yet, retrying in ${waitMs}ms`);
      spawnSync(process.execPath, ["-e", `setTimeout(() => {}, ${waitMs})`]);
      return runPrisma(args, attempt + 1);
    }

    return result;
  }

  let deploy = runPrisma(["migrate", "deploy"]);

  // P3005: the database already carries the schema but has no migration history
  // (for example it was created with `prisma db push`). The test database is a
  // disposable, empty database, so the existing schema is baselined rather than
  // dropped - nothing is ever deleted here. Prisma reports P3005 on stderr.
  if (
    deploy.status !== 0 &&
    `${deploy.stdout ?? ""}${deploy.stderr ?? ""}`.includes("P3005")
  ) {
    console.log("[db-tests] schema present without migration history - baselining");

    for (const migration of readdirSync("prisma/migrations", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const resolved = runPrisma(["migrate", "resolve", "--applied", migration]);
      if (resolved.status !== 0) {
        // Already recorded (P3008) is success, not a failure.
        if (`${resolved.stdout ?? ""}${resolved.stderr ?? ""}`.includes("P3008")) continue;
        throw new Error(
          `Failed to baseline migration ${migration}: ${resolved.stderr || resolved.stdout}`,
        );
      }
    }

    deploy = runPrisma(["migrate", "deploy"]);
  }

  if (deploy.status !== 0) {
    process.stdout.write(deploy.stdout ?? "");
    process.stderr.write(deploy.stderr ?? "");
    throw new Error("prisma migrate deploy failed against the test database.");
  }

  process.stdout.write(deploy.stdout ?? "");

  console.log("[db-tests] migrations applied to the test database");
}
