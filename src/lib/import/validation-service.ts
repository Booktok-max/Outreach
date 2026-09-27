import { chunk, unique } from "@/lib/collections";
import { prisma } from "@/lib/db";
import { classifyDuplicates, type DuplicateKindValue } from "@/lib/domain/dedupe";
import { hashValue, normalizeCanonicalValues } from "@/lib/domain/normalize";
import type { NormalizedRow, ValidationIssue } from "@/lib/domain/types";
import { validateNormalizedRow } from "@/lib/domain/validate";
import { applyMapping, type ColumnMapping } from "@/lib/import/mapping";
import { Prisma } from "@/generated/prisma/client";

import type { ImportRowStatus } from "@/generated/prisma/enums";

/**
 * VALIDATE + PREVIEW stage.
 *
 * Runs normalization, validation and de-duplication for every staged row and
 * stores the result on the row itself, so the review screen, the filters and
 * the commit step all read the same verdicts. Nothing is written to the
 * canonical tables here.
 */

const READ_CHUNK_SIZE = 1000;
const LOOKUP_CHUNK_SIZE = 400;
const UPDATE_CHUNK_SIZE = 400;

export interface BatchSummary {
  totalRows: number;
  pending: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  skipped: number;
  duplicateBreakdown: Record<DuplicateKindValue, number>;
}

export const EMPTY_SUMMARY: BatchSummary = {
  totalRows: 0,
  pending: 0,
  valid: 0,
  invalid: 0,
  duplicate: 0,
  imported: 0,
  skipped: 0,
  duplicateBreakdown: {
    SOURCE_ROW: 0,
    EMAIL_IN_BATCH: 0,
    EMAIL_EXISTING: 0,
    RELATIONSHIP_EXISTING: 0,
  },
};

export async function getBatchSummary(batchId: string): Promise<BatchSummary> {
  const [statusGroups, duplicateGroups] = await Promise.all([
    prisma.importRow.groupBy({
      by: ["status"],
      where: { importBatchId: batchId },
      _count: { _all: true },
    }),
    prisma.importRow.groupBy({
      by: ["duplicateKind"],
      where: { importBatchId: batchId, duplicateKind: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const summary: BatchSummary = {
    ...EMPTY_SUMMARY,
    duplicateBreakdown: { ...EMPTY_SUMMARY.duplicateBreakdown },
  };

  let counted = 0;
  for (const group of statusGroups) {
    const count = group._count._all;
    counted += count;
    switch (group.status) {
      case "PENDING":
        summary.pending = count;
        break;
      case "VALID":
        summary.valid = count;
        break;
      case "INVALID":
        summary.invalid = count;
        break;
      case "DUPLICATE":
        summary.duplicate = count;
        break;
      case "IMPORTED":
        summary.imported = count;
        break;
      case "SKIPPED":
        summary.skipped = count;
        break;
      default:
        break;
    }
  }

  for (const group of duplicateGroups) {
    if (!group.duplicateKind) continue;
    summary.duplicateBreakdown[group.duplicateKind as DuplicateKindValue] = group._count._all;
  }

  summary.totalRows = counted;
  return summary;
}

/** Builds the "what already exists in the database" snapshot for de-duplication. */
async function loadExistingSnapshot(emails: string[], bookKeys: string[]) {
  const emailMap = new Map<string, string>();
  const bookMap = new Map<string, { id: string; title: string; quickKey: string }>();

  const uniqueEmails = unique(emails).filter((value) => value.length > 0);
  const uniqueKeys = unique(bookKeys).filter((value) => value.length > 0);

  for (const slice of chunk(uniqueEmails, LOOKUP_CHUNK_SIZE)) {
    const contacts = await prisma.contactPoint.findMany({
      where: { type: "EMAIL", normalizedValue: { in: slice } },
      select: {
        normalizedValue: true,
        person: { select: { fullName: true, firstName: true, lastName: true } },
      },
    });
    for (const contact of contacts) {
      const label =
        contact.person.fullName ??
        [contact.person.firstName, contact.person.lastName].filter(Boolean).join(" ");
      emailMap.set(contact.normalizedValue, label.length > 0 ? label : "existing contact");
    }
  }

  for (const slice of chunk(uniqueKeys, LOOKUP_CHUNK_SIZE)) {
    const books = await prisma.book.findMany({
      where: { quickKey: { in: slice } },
      select: { id: true, quickKey: true, title: true },
    });
    for (const book of books) {
      bookMap.set(book.quickKey, { id: book.id, title: book.title, quickKey: book.quickKey });
    }
  }

  const relationshipMap = new Map<string, string>();

  for (const slice of chunk(uniqueEmails, LOOKUP_CHUNK_SIZE)) {
    const persons = await prisma.person.findMany({
      where: { primaryEmail: { in: slice } },
      select: { id: true, primaryEmail: true, fullName: true },
    });
    if (persons.length === 0) continue;

    const links = await prisma.personBook.findMany({
      where: { personId: { in: persons.map((person) => person.id) } },
      select: {
        personId: true,
        book: { select: { quickKey: true, title: true } },
      },
    });

    const personById = new Map(persons.map((person) => [person.id, person]));
    for (const link of links) {
      const person = personById.get(link.personId);
      const email = person?.primaryEmail;
      if (!email) continue;
      relationshipMap.set(
        `${email}|${link.book.quickKey}`,
        `${person?.fullName ?? email} / ${link.book.title}`,
      );
    }
  }

  return { emailMap, relationshipMap, bookMap };
}

export interface ValidateBatchResult {
  summary: BatchSummary;
  durationMs: number;
}

/**
 * Normalizes, validates and de-duplicates every staged row of a batch.
 * Idempotent: running it again simply recomputes the verdicts.
 */
export async function validateBatch(batchId: string): Promise<ValidateBatchResult> {
  const startedAt = Date.now();

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, columnMapping: true, status: true },
  });

  if (!batch) throw new Error("IMPORT_BATCH_NOT_FOUND");
  if (batch.status === "IMPORTED") throw new Error("IMPORT_BATCH_ALREADY_IMPORTED");

  const mapping = (batch.columnMapping ?? {}) as ColumnMapping;

  interface StagedRow {
    id: string;
    rowNumber: number;
    normalized: NormalizedRow;
  }

  // 1. Read every staged row (chunked to bound memory) and normalize it.
  const staged: StagedRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page: Array<{ id: string; rowNumber: number; rawData: unknown }> = await prisma.importRow.findMany({
      where: { importBatchId: batchId },
      select: { id: true, rowNumber: true, rawData: true },
      orderBy: { rowNumber: "asc" },
      take: READ_CHUNK_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (page.length === 0) break;

    for (const row of page) {
      const raw = (row.rawData ?? {}) as Record<string, unknown>;
      staged.push({
        id: row.id,
        rowNumber: row.rowNumber,
        normalized: normalizeCanonicalValues(applyMapping(raw, mapping)),
      });
    }

    cursor = page[page.length - 1]?.id ?? null;
    if (page.length < READ_CHUNK_SIZE) break;
  }

  // 2. Snapshot what already exists so duplicates can be labelled precisely.
  const snapshot = await loadExistingSnapshot(
    staged.map((row) => row.normalized.email?.normalized ?? ""),
    staged.map((row) => row.normalized.bookQuickKey ?? ""),
  );

  const duplicateDecisions = classifyDuplicates(
    staged.map((row) => ({
      rowNumber: row.rowNumber,
      sourceFingerprint: row.normalized.sourceFingerprint,
      identityKey: row.normalized.identityKey,
      emailNormalized: row.normalized.email?.normalized ?? null,
    })),
    { emails: snapshot.emailMap, relationships: snapshot.relationshipMap },
  );

  // 3. Validate + decide the final status of every row.
  interface RowUpdate {
    id: string;
    status: ImportRowStatus;
    normalized: NormalizedRow;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    duplicateKind: DuplicateKindValue | null;
    duplicateMessage: string | null;
  }

  const updates: RowUpdate[] = staged.map((row) => {
    const validation = validateNormalizedRow(row.normalized);
    const duplicate = duplicateDecisions.get(row.rowNumber) ?? null;

    const status: ImportRowStatus =
      validation.status === "invalid" ? "INVALID" : duplicate?.duplicate ? "DUPLICATE" : "VALID";

    return {
      id: row.id,
      status,
      normalized: row.normalized,
      errors: validation.errors,
      warnings: validation.warnings,
      duplicateKind: status === "DUPLICATE" ? (duplicate?.kind ?? null) : null,
      duplicateMessage: status === "DUPLICATE" ? (duplicate?.message ?? null) : null,
    };
  });

  for (const slice of chunk(updates, UPDATE_CHUNK_SIZE)) {
    await prisma.$transaction(
      slice.map((update) =>
        prisma.importRow.update({
          where: { id: update.id },
          data: {
            status: update.status,
            normalizedData: update.normalized as unknown as Prisma.InputJsonObject,
            errors: update.errors as unknown as Prisma.InputJsonArray,
            warnings: update.warnings as unknown as Prisma.InputJsonArray,
            duplicateKind: update.duplicateKind,
            duplicateMessage: update.duplicateMessage,
            sourceFingerprint: update.normalized.sourceFingerprint || hashValue("empty"),
            identityKey: update.normalized.identityKey,
          },
        }),
      ),
    );
  }

  const summary = await getBatchSummary(batchId);

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: "VALIDATED",
      validatedAt: new Date(),
      totalRows: summary.totalRows,
      validRows: summary.valid,
      invalidRows: summary.invalid,
      duplicateRows: summary.duplicate,
      failureMessage: null,
    },
  });

  return { summary, durationMs: Date.now() - startedAt };
}

export type PreviewFilter = "all" | "valid" | "invalid" | "duplicate" | "imported" | "pending";

const FILTER_STATUS: Record<Exclude<PreviewFilter, "all">, ImportRowStatus> = {
  valid: "VALID",
  invalid: "INVALID",
  duplicate: "DUPLICATE",
  imported: "IMPORTED",
  pending: "PENDING",
};

export interface PreviewRow {
  id: string;
  rowNumber: number;
  status: ImportRowStatus;
  duplicateKind: DuplicateKindValue | null;
  duplicateMessage: string | null;
  normalized: NormalizedRow | null;
  raw: Record<string, unknown>;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface PreviewPage {
  rows: PreviewRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PreviewQuery {
  filter?: PreviewFilter;
  page?: number;
  pageSize?: number;
}

/** Server side, paginated row preview. The full dataset never reaches the UI. */
export async function getBatchPreview(
  batchId: string,
  query: PreviewQuery = {},
): Promise<PreviewPage> {
  const filter = query.filter ?? "all";
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

  const where =
    filter === "all"
      ? { importBatchId: batchId }
      : { importBatchId: batchId, status: FILTER_STATUS[filter] };

  const [total, rows] = await Promise.all([
    prisma.importRow.count({ where }),
    prisma.importRow.findMany({
      where,
      orderBy: { rowNumber: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rowNumber: true,
        status: true,
        duplicateKind: true,
        duplicateMessage: true,
        normalizedData: true,
        rawData: true,
        errors: true,
        warnings: true,
      },
    }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      status: row.status,
      duplicateKind: (row.duplicateKind as DuplicateKindValue | null) ?? null,
      duplicateMessage: row.duplicateMessage,
      normalized: (row.normalizedData as unknown as NormalizedRow | null) ?? null,
      raw: (row.rawData ?? {}) as Record<string, unknown>,
      errors: (row.errors as unknown as ValidationIssue[] | null) ?? [],
      warnings: (row.warnings as unknown as ValidationIssue[] | null) ?? [],
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}


