/**
 * Shared helpers for the database integration tests.
 *
 * Every test file starts from empty tables so the suite is order independent.
 * `resetDatabase` issues a single TRUNCATE ... CASCADE, which is fast and never
 * touches the schema itself.
 */
import { prisma } from "@/lib/db";

/** Every table the application owns, in an order that satisfies FKs. */
const TABLES = [
  "outreach_event",
  "outreach_status",
  "import_row",
  "import_batch",
  "contact_point",
  "person_book",
  "book",
  "person",
] as const;

/** Empties all application tables in the test database. */
export async function resetDatabase(): Promise<void> {
  const quoted = TABLES.map((table) => `"${table}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
}

/** Small CSV fixture builder so tests read as data, not as string plumbing. */
export function csvFixture(headers: string[], rows: Array<Array<string>>): Buffer {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}
