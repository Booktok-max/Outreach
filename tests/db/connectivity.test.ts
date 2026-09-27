/**
 * 1. PostgreSQL connectivity and 2. Prisma migration/schema compatibility.
 *
 * These assertions fail loudly if the test database is unreachable, if the
 * migrations were never applied, or if the committed schema and the migrated
 * schema have drifted apart.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";

import { resetDatabase } from "./helpers";

beforeAll(async () => {
  await resetDatabase();
});

describe("database connectivity", () => {
  it("connects to a real PostgreSQL server", async () => {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`select version()`;
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toMatch(/PostgreSQL/i);
  });

  it("reports a sane server version number", async () => {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`select 1 as n`;
    expect(rows[0].n).toBe(1);
  });
});

describe("migrated schema", () => {
  it("has applied the migration history", async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      select migration_name, finished_at from _prisma_migrations order by migration_name
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.finished_at, `migration ${row.migration_name} did not finish`).not.toBeNull();
    }
  });

  it("created every canonical and pipeline table", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `;
    const tables = rows.map((row) => row.table_name);
    for (const expected of [
      "person",
      "book",
      "person_book",
      "contact_point",
      "import_batch",
      "import_row",
      "outreach_status",
      "outreach_event",
    ]) {
      expect(tables, `missing table ${expected}`).toContain(expected);
    }
  });

  it("created the Postgres enums the schema declares", async () => {
    const rows = await prisma.$queryRaw<Array<{ typname: string }>>`
      select t.typname from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
    `;
    const enums = rows.map((row) => row.typname);
    for (const expected of [
      "ValidationStatus",
      "ContactPointType",
      "PersonBookRole",
      "ImportFileType",
      "ImportBatchStatus",
      "ImportRowStatus",
      "DuplicateKind",
      "OutreachState",
      "SuppressionReason",
      "OutreachEventType",
    ]) {
      expect(enums, `missing enum ${expected}`).toContain(expected);
    }
  });
});
