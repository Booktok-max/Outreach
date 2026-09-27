/**
 * 3./4./6. Import batch and row persistence, canonical record persistence, and
 * validation persistence - exercised through the real pipeline:
 * stageImport -> saveMapping -> validateBatch -> commitBatch.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { saveMapping, stageImport } from "@/lib/import/batch-service";
import { commitBatch } from "@/lib/import/commit-service";
import { getBatchPreview, validateBatch } from "@/lib/import/validation-service";

import { csvFixture, resetDatabase } from "./helpers";

const HEADERS = ["email", "author name", "book title", "genre", "website"];

const MAPPING = {
  email: "email",
  "author name": "authorName",
  "book title": "bookTitle",
  genre: "genre",
  website: "websiteUrl",
} as const;

async function stageAndValidate(rows: Array<Array<string>>) {
  const staged = await stageImport({
    filename: "leads.csv",
    mimeType: "text/csv",
    buffer: csvFixture(HEADERS, rows),
  });
  expect(staged.outcome).toBe("staged");
  if (staged.outcome !== "staged") throw new Error("unreachable");

  await saveMapping({ batchId: staged.batchId, mapping: { ...MAPPING } });
  const result = await validateBatch(staged.batchId);
  return { batchId: staged.batchId, ...result };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("import batch and row persistence", () => {
  it("persists the batch header with checksum and staged rows", async () => {
    const staged = await stageImport({
      filename: "leads.csv",
      mimeType: "text/csv",
      buffer: csvFixture(HEADERS, [
        ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
        ["john@example.com", "John Roe", "Another Book", "Fantasy", "johnroe.com"],
      ]),
    });
    expect(staged.outcome).toBe("staged");
    if (staged.outcome !== "staged") throw new Error("unreachable");

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: staged.batchId } });
    expect(batch.status).toBe("UPLOADED");
    expect(batch.fileType).toBe("CSV");
    expect(batch.filename).toBe("leads.csv");
    expect(batch.fileSize).toBeGreaterThan(0);
    expect(batch.fileChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(batch.totalRows).toBe(2);

    const rows = await prisma.importRow.findMany({
      where: { importBatchId: staged.batchId },
      orderBy: { rowNumber: "asc" },
    });
    expect(rows.map((row) => row.rowNumber)).toEqual([1, 2]);
    expect(rows.every((row) => row.status === "PENDING")).toBe(true);
    // Raw source values are preserved verbatim for audit.
    expect((rows[0].rawData as Record<string, string>).email).toBe("jane@example.com");
  });

  it("stores validation verdicts, errors and warnings on the row", async () => {
    const { batchId, summary } = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
      ["not-an-email", "Broken Row", "A Bad Book", "Sci-Fi", "broken.com"],
    ]);

    expect(summary.valid).toBe(1);
    expect(summary.invalid).toBe(1);
    expect(summary.totalRows).toBe(2);

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe("VALIDATED");
    expect(batch.validatedAt).not.toBeNull();

    const invalid = await prisma.importRow.findFirstOrThrow({
      where: { importBatchId: batchId, status: "INVALID" },
    });
    const errors = invalid.errors as Array<{ code: string }>;
    expect(errors.some((error) => error.code === "EMAIL_INVALID")).toBe(true);

    const valid = await prisma.importRow.findFirstOrThrow({
      where: { importBatchId: batchId, status: "VALID" },
    });
    // Missing scheme on the website is auto-prefixed and reported as a warning.
    const warnings = valid.warnings as Array<{ code: string }>;
    expect(warnings.some((warning) => warning.code === "URL_NORMALIZED")).toBe(true);
    expect(valid.normalizedData).not.toBeNull();
    expect(valid.sourceFingerprint).toBeTruthy();
  });

  it("pages the preview query from persisted rows", async () => {
    const { batchId } = await stageAndValidate([
      ["a@example.com", "A Author", "Book A", "Sci-Fi", "a.com"],
      ["b@example.com", "B Author", "Book B", "Sci-Fi", "b.com"],
      ["bad", "C Author", "Book C", "Sci-Fi", "c.com"],
    ]);

    const firstPage = await getBatchPreview(batchId, { page: 1, pageSize: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.rows).toHaveLength(2);
    expect(firstPage.totalPages).toBe(2);

    const invalidOnly = await getBatchPreview(batchId, { filter: "invalid" });
    expect(invalidOnly.total).toBe(1);
    expect(invalidOnly.rows[0].status).toBe("INVALID");
  });
});

describe("canonical record persistence", () => {
  it("writes person, book, person_book, contact_point and outreach_status on commit", async () => {
    const { batchId } = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
    ]);

    const result = await commitBatch(batchId);
    expect(result.status).toBe("imported");
    expect(result.importedRows).toBe(1);
    expect(result.createdPeople).toBe(1);
    expect(result.createdBooks).toBe(1);
    expect(result.linkedRelationships).toBe(1);

    const person = await prisma.person.findFirstOrThrow();
    expect(person.fullName).toBe("Jane Doe");
    expect(person.primaryEmail).toBe("jane@example.com");
    expect(person.emailStatus).toBe("VALID");
    expect(person.websiteUrl).toBe("https://janedoe.com/");
    // Derived search cache is maintained by the single write path.
    expect(person.searchText).toContain("jane doe");

    const book = await prisma.book.findFirstOrThrow();
    expect(book.title).toBe("A Great Book");
    expect(book.genre).toBe("Sci-Fi");
    expect(book.searchText).toContain("a great book");

    const link = await prisma.personBook.findFirstOrThrow();
    expect(link.role).toBe("AUTHOR");
    expect(link.isPrimaryBook).toBe(true);

    const contact = await prisma.contactPoint.findFirstOrThrow();
    expect(contact.type).toBe("EMAIL");
    expect(contact.normalizedValue).toBe("jane@example.com");
    expect(contact.isPrimary).toBe(true);

    const outreach = await prisma.outreachStatus.findFirstOrThrow();
    expect(outreach.status).toBe("PENDING");

    const row = await prisma.importRow.findFirstOrThrow({ where: { importBatchId: batchId } });
    expect(row.status).toBe("IMPORTED");
    expect(row.personId).toBe(person.id);
    expect(row.bookId).toBe(book.id);
  });

  it("reuses the existing person and book for a second batch about the same contact", async () => {
    const first = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
    ]);
    await commitBatch(first.batchId);

    const second = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Second Book", "Fantasy", "janedoe.com"],
    ]);
    const result = await commitBatch(second.batchId, { includeExistingEmailRows: true });

    expect(result.createdPeople).toBe(0);
    expect(result.createdBooks).toBe(1);
    expect(result.linkedRelationships).toBe(1);

    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.book.count()).toBe(2);
    // A second relationship is created but is not promoted to primary book.
    const links = await prisma.personBook.findMany({ orderBy: { createdAt: "asc" } });
    expect(links).toHaveLength(2);
    expect(links.filter((link) => link.isPrimaryBook)).toHaveLength(1);
  });

  it("refuses to commit a batch that was never validated", async () => {
    const staged = await stageImport({
      filename: "leads.csv",
      mimeType: "text/csv",
      buffer: csvFixture(HEADERS, [["jane@example.com", "Jane Doe", "Book", "Sci-Fi", "j.com"]]),
    });
    if (staged.outcome !== "staged") throw new Error("unreachable");

    await expect(commitBatch(staged.batchId)).rejects.toThrow("IMPORT_BATCH_NOT_VALIDATED");
  });

  it("reports nothing_to_import when no row is eligible", async () => {
    const { batchId } = await stageAndValidate([["bad", "Broken", "Bad Book", "Sci-Fi", "b.com"]]);
    const result = await commitBatch(batchId);
    expect(result.status).toBe("nothing_to_import");
    expect(result.importedRows).toBe(0);
    expect(await prisma.person.count()).toBe(0);
  });
});
