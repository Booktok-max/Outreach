/**
 * 5. Uniqueness / de-duplication constraints and 9. Transaction rollback.
 *
 * The de-duplication tests drive the real validateBatch path; the constraint
 * tests bypass the service layer to prove the guarantees are enforced by
 * PostgreSQL itself, not only by application code.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { saveMapping, stageImport } from "@/lib/import/batch-service";
import { commitBatch } from "@/lib/import/commit-service";
import { validateBatch } from "@/lib/import/validation-service";

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

describe("de-duplication verdicts", () => {
  it("flags an identical source row as SOURCE_ROW", async () => {
    const { batchId, summary } = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
    ]);

    expect(summary.duplicate).toBe(1);
    expect(summary.duplicateBreakdown.SOURCE_ROW).toBe(1);

    const duplicate = await prisma.importRow.findFirstOrThrow({
      where: { importBatchId: batchId, status: "DUPLICATE" },
    });
    expect(duplicate.duplicateKind).toBe("SOURCE_ROW");
    expect(duplicate.duplicateMessage).toBeTruthy();
  });

  it("flags an email already owned by a database contact as EMAIL_EXISTING", async () => {
    const first = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
    ]);
    await commitBatch(first.batchId);

    // Uppercase in the source normalizes to the address already stored.
    const second = await stageAndValidate([
      ["JANE@example.com", "Jane Doe", "A Different Book", "Fantasy", "janedoe.com"],
    ]);

    expect(second.summary.duplicate).toBe(1);
    expect(second.summary.duplicateBreakdown.EMAIL_EXISTING).toBe(1);
  });

  it("flags a repeat of an already imported row", async () => {
    const first = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
    ]);
    await commitBatch(first.batchId);

    const second = await stageAndValidate([
      ["jane@example.com", "Jane Doe", "A Great Book", "Sci-Fi", "janedoe.com"],
    ]);
    expect(second.summary.duplicate).toBe(1);
    const kinds =
      second.summary.duplicateBreakdown.SOURCE_ROW +
      second.summary.duplicateBreakdown.RELATIONSHIP_EXISTING +
      second.summary.duplicateBreakdown.EMAIL_EXISTING;
    expect(kinds).toBe(1);
  });
});


describe("database-level uniqueness", () => {
  it("allows only one EMAIL contact point per normalized address", async () => {
    const owner = await prisma.person.create({ data: { fullName: "Owner" } });
    await prisma.contactPoint.create({
      data: {
        personId: owner.id,
        type: "EMAIL",
        value: "dup@example.com",
        normalizedValue: "dup@example.com",
        isPrimary: true,
      },
    });

    const other = await prisma.person.create({ data: { fullName: "Other" } });
    await expect(
      prisma.contactPoint.create({
        data: {
          personId: other.id,
          type: "EMAIL",
          value: "dup@example.com",
          normalizedValue: "dup@example.com",
        },
      }),
    ).rejects.toThrow();

    expect(await prisma.contactPoint.count()).toBe(1);
  });

  it("allows the same value under a different contact type", async () => {
    const owner = await prisma.person.create({ data: { fullName: "Owner" } });
    await prisma.contactPoint.create({
      data: {
        personId: owner.id,
        type: "EMAIL",
        value: "shared@example.com",
        normalizedValue: "shared@example.com",
      },
    });
    await prisma.contactPoint.create({
      data: {
        personId: owner.id,
        type: "WEBSITE",
        value: "shared@example.com",
        normalizedValue: "shared@example.com",
      },
    });

    expect(await prisma.contactPoint.count()).toBe(2);
  });

  it("allows only one outreach_status per person", async () => {
    const person = await prisma.person.create({ data: { fullName: "Solo" } });
    await prisma.outreachStatus.create({ data: { personId: person.id, status: "PENDING" } });

    await expect(
      prisma.outreachStatus.create({ data: { personId: person.id, status: "APPROVED" } }),
    ).rejects.toThrow();

    expect(await prisma.outreachStatus.count()).toBe(1);
  });

  it("allows only one person_book row per person/book/role", async () => {
    const person = await prisma.person.create({ data: { fullName: "Link" } });
    const book = await prisma.book.create({
      data: { title: "T", normalizedTitle: "t", quickKey: "t|a" },
    });
    await prisma.personBook.create({ data: { personId: person.id, bookId: book.id, role: "AUTHOR" } });

    await expect(
      prisma.personBook.create({ data: { personId: person.id, bookId: book.id, role: "AUTHOR" } }),
    ).rejects.toThrow();

    // A different role for the same relationship is legitimate.
    await prisma.personBook.create({ data: { personId: person.id, bookId: book.id, role: "EDITOR" } });
    expect(await prisma.personBook.count()).toBe(2);
  });

  it("rejects a duplicate row number inside one batch", async () => {
    const batch = await prisma.importBatch.create({
      data: { filename: "dup.csv", fileType: "CSV", fileSize: 1, fileChecksum: "a".repeat(64) },
    });
    await prisma.importRow.create({
      data: { importBatchId: batch.id, rowNumber: 1, rawData: { a: "1" } },
    });

    await expect(
      prisma.importRow.create({ data: { importBatchId: batch.id, rowNumber: 1, rawData: { a: "2" } } }),
    ).rejects.toThrow();
  });
});
