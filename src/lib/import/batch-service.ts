import { chunk } from "@/lib/collections";
import { getEnv } from "@/lib/env";
import { detectColumns, suggestMapping, type ColumnMapping } from "@/lib/import/mapping";
import { detectFileType, listXlsxSheets, parseUpload, ParseError } from "@/lib/import/parsers";
import type { SupportedFileType } from "@/lib/import/parsers";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { createHash } from "node:crypto";

/**
 * Staging stage of the import pipeline (UPLOAD -> INSPECT -> MAP).
 *
 * The uploaded file is parsed server side and every row is written to
 * `import_row` with its raw values. Nothing is imported into the canonical
 * tables here - that only happens after the operator confirms the mapping and
 * the preview (see commit-service.ts).
 *
 * The raw file itself is never persisted: the staged rows plus a SHA-256
 * checksum are enough for audit and keep contact data out of the filesystem.
 */

export interface StageImportInput {
  filename: string;
  mimeType: string | null;
  buffer: Buffer;
  sheetName?: string;
  createdBy?: string;
}

export type StageImportResult =
  | {
      outcome: "staged";
      batchId: string;
      headers: string[];
      totalRows: number;
      truncated: boolean;
      sourceRowCount: number;
      sheetName: string | null;
      sheetNames: string[];
      fileType: SupportedFileType;
    }
  | {
      outcome: "sheet_selection_required";
      sheetNames: string[];
      fileType: SupportedFileType;
    };

const INSERT_CHUNK_SIZE = 500;

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function stageImport(input: StageImportInput): Promise<StageImportResult> {
  const env = getEnv();
  const { fileType } = detectFileType(input.filename, input.mimeType, input.buffer);

  let sheetNames: string[] = [];
  if (fileType === "xlsx") {
    sheetNames = await listXlsxSheets(input.buffer);
    if (sheetNames.length > 1 && !input.sheetName) {
      // Ask the operator which worksheet to use instead of guessing.
      return { outcome: "sheet_selection_required", sheetNames, fileType };
    }
  }

  const parsed = await parseUpload(input.buffer, fileType, {
    maxRows: env.MAX_IMPORT_ROWS,
    ...(input.sheetName ? { sheetName: input.sheetName } : {}),
  });

  const detections = detectColumns(parsed.headers);
  const suggested = suggestMapping(detections);

  const batch = await prisma.importBatch.create({
    data: {
      filename: sanitizeFilename(input.filename),
      fileType: fileType === "csv" ? "CSV" : "XLSX",
      fileSize: input.buffer.byteLength,
      fileChecksum: sha256(input.buffer),
      sheetNames: sheetNames.length > 0 ? sheetNames : undefined,
      sheetName: parsed.sheetName ?? null,
      status: "UPLOADED",
      totalRows: parsed.rows.length,
      rowLimitExceeded: parsed.truncated,
      detectedColumns: detections as unknown as Prisma.InputJsonValue,
      columnMapping: suggested as unknown as Prisma.InputJsonValue,
      createdBy: input.createdBy ?? null,
    },
    select: { id: true },
  });

  const rows = parsed.rows.map((rawData, index) => ({
    importBatchId: batch.id,
    rowNumber: index + 1,
    rawData: rawData as unknown as Prisma.InputJsonObject,
    status: "PENDING" as const,
  }));

  for (const slice of chunk(rows, INSERT_CHUNK_SIZE)) {
    await prisma.importRow.createMany({ data: slice });
  }

  return {
    outcome: "staged",
    batchId: batch.id,
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    truncated: parsed.truncated,
    sourceRowCount: parsed.sourceRowCount,
    sheetName: parsed.sheetName ?? null,
    sheetNames,
    fileType,
  };
}

/** Strips path separators so a hostile filename cannot influence storage. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "upload";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 180);
}

export interface SaveMappingInput {
  batchId: string;
  mapping: ColumnMapping;
}

/**
 * Persists the operator-confirmed mapping and moves the batch to MAPPED.
 * Rows keep their raw data; normalization happens during validation.
 */
export async function saveMapping(input: SaveMappingInput): Promise<void> {
  await prisma.importBatch.update({
    where: { id: input.batchId },
    data: {
      columnMapping: input.mapping as unknown as Prisma.InputJsonValue,
      mappingConfirmedAt: new Date(),
      status: "MAPPED",
      validatedAt: null,
      failureMessage: null,
    },
  });

  // Re-running the mapping invalidates previous validation results.
  await prisma.importRow.updateMany({
    where: { importBatchId: input.batchId },
    data: {
      status: "PENDING",
      normalizedData: Prisma.DbNull,
      errors: Prisma.DbNull,
      warnings: Prisma.DbNull,
      duplicateKind: null,
      duplicateMessage: null,
      sourceFingerprint: null,
      identityKey: null,
    },
  });
}

/** Cancels a staged batch. Imported data is never removed by this action. */
export async function cancelBatch(batchId: string): Promise<{ cancelled: boolean; reason?: string }> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { status: true },
  });

  if (!batch) return { cancelled: false, reason: "not_found" };
  if (batch.status === "IMPORTED") {
    return { cancelled: false, reason: "already_imported" };
  }

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "CANCELLED" } });
  return { cancelled: true };
}

export { ParseError };
