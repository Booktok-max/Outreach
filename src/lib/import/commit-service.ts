import { chunk } from "@/lib/collections";
import { prisma } from "@/lib/db";
import type { NormalizedRow } from "@/lib/domain/types";
import { normalizeKey } from "@/lib/text";
import { linkPersonBook, upsertBookFromRow, upsertPersonFromRow } from "@/lib/persistence/writes";

import { getBatchSummary, type BatchSummary } from "./validation-service";

/**
 * CONFIRM -> IMPORT stage.
 *
 * Only rows the operator has seen (status VALID, and optionally the
 * `EMAIL_EXISTING` duplicates they explicitly chose to link) are written to the
 * canonical tables. Rows are processed in small transactions so a failure part
 * way through leaves a resumable batch instead of a half-written row set.
 */

const COMMIT_CHUNK_SIZE = 100;

export type PersonBookRoleValue =
  | "AUTHOR"
  | "CO_AUTHOR"
  | "EDITOR"
  | "ILLUSTRATOR"
  | "TRANSLATOR"
  | "CONTRIBUTOR"
  | "PUBLISHER"
  | "AGENT";

/** Infers the person<->book role from the mapped role/notes text. */
export function inferPersonBookRole(row: NormalizedRow): PersonBookRoleValue {
  const text = normalizeKey([row.role, row.notes].filter(Boolean).join(" "));
  if (text.length === 0) return "AUTHOR";

  if (/\beditor\b/.test(text)) return "EDITOR";
  if (/\billustrator\b/.test(text)) return "ILLUSTRATOR";
  if (/\btranslator\b/.test(text)) return "TRANSLATOR";
  if (/\bcontributor\b|\banthology\b/.test(text)) return "CONTRIBUTOR";
  if (/\bco author\b|\bcoauthor\b/.test(text)) return "CO_AUTHOR";
  if (/\bpublisher\b|\bpress\b/.test(text)) return "PUBLISHER";
  if (/\bagent\b|\bagency\b/.test(text)) return "AGENT";
  return "AUTHOR";
}

export interface CommitBatchOptions {
  /**
   * Also import rows whose only problem is that the email already exists in the
   * database (attaching a new book to an existing contact).
   */
  includeExistingEmailRows?: boolean;
  actor?: string;
}

export interface CommitBatchResult {
  status: "imported" | "partial" | "failed" | "nothing_to_import";
  importedRows: number;
  createdPeople: number;
  createdBooks: number;
  linkedRelationships: number;
  skippedRows: number;
  failureMessage: string | null;
  summary: BatchSummary;
}

/**
 * Writes the reviewed rows of a batch into person / book / person_book /
 * contact_point / outreach_status and marks the rows IMPORTED.
 */
export async function commitBatch(
  batchId: string,
  options: CommitBatchOptions = {},
): Promise<CommitBatchResult> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true },
  });

  if (!batch) throw new Error("IMPORT_BATCH_NOT_FOUND");
  if (batch.status === "UPLOADED" || batch.status === "MAPPED") {
    throw new Error("IMPORT_BATCH_NOT_VALIDATED");
  }
  if (batch.status === "CANCELLED") throw new Error("IMPORT_BATCH_CANCELLED");

  const candidates = await prisma.importRow.findMany({
    where: {
      importBatchId: batchId,
      ...(options.includeExistingEmailRows
        ? { OR: [{ status: "VALID" }, { duplicateKind: "EMAIL_EXISTING" }] }
        : { status: "VALID" }),
    },
    orderBy: { rowNumber: "asc" },
    select: { id: true, rowNumber: true, normalizedData: true },
  });

  if (candidates.length === 0) {
    const summary = await getBatchSummary(batchId);
    return {
      status: "nothing_to_import",
      importedRows: 0,
      createdPeople: 0,
      createdBooks: 0,
      linkedRelationships: 0,
      skippedRows: 0,
      failureMessage: null,
      summary,
    };
  }

  let importedRows = 0;
  let createdPeople = 0;
  let createdBooks = 0;
  let linkedRelationships = 0;
  let skippedRows = 0;
  let failureMessage: string | null = null;

  for (const slice of chunk(candidates, COMMIT_CHUNK_SIZE)) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        let people = 0;
        let books = 0;
        let links = 0;
        let skipped = 0;
        let written = 0;

        for (const candidate of slice) {
          const normalized = candidate.normalizedData as unknown as NormalizedRow | null;
          if (!normalized || !normalized.email) {
            skipped += 1;
            await tx.importRow.update({
              where: { id: candidate.id },
              data: {
                status: "SKIPPED",
                duplicateMessage: "No usable normalized data - row skipped during import.",
              },
            });
            continue;
          }

          const person = await upsertPersonFromRow(tx, normalized);
          const book = await upsertBookFromRow(tx, normalized);

          if (book.bookId) {
            const link = await linkPersonBook(
              tx,
              person.personId,
              book.bookId,
              inferPersonBookRole(normalized),
            );
            if (link.created) links += 1;
          }

          await tx.outreachStatus.upsert({
            where: { personId: person.personId },
            create: { personId: person.personId, status: "PENDING" },
            update: {},
          });

          await tx.importRow.update({
            where: { id: candidate.id },
            data: { status: "IMPORTED", personId: person.personId, bookId: book.bookId },
          });

          if (person.created) people += 1;
          if (book.created) books += 1;
          written += 1;
        }

        return { people, books, links, skipped, written };
      });

      createdPeople += result.people;
      createdBooks += result.books;
      linkedRelationships += result.links;
      skippedRows += result.skipped;
      importedRows += result.written;
    } catch (error) {
      failureMessage =
        error instanceof Error ? error.message : "Unknown error while writing import rows.";
      break;
    }
  }

  const summary = await getBatchSummary(batchId);
  const remaining = summary.valid + (options.includeExistingEmailRows ? summary.duplicate : 0);

  const status: CommitBatchResult["status"] = failureMessage
    ? importedRows > 0
      ? "partial"
      : "failed"
    : remaining > 0
      ? "partial"
      : "imported";

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: failureMessage && importedRows === 0 ? "FAILED" : "IMPORTED",
      importedAt: new Date(),
      failureMessage,
      validRows: summary.valid,
      invalidRows: summary.invalid,
      duplicateRows: summary.duplicate,
      importedRows: summary.imported,
      skippedRows: summary.skipped,
      totalRows: summary.totalRows,
    },
  });

  return {
    status,
    importedRows,
    createdPeople,
    createdBooks,
    linkedRelationships,
    skippedRows,
    failureMessage,
    summary,
  };
}

