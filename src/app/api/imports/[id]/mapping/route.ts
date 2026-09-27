import { handleApiError, jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { MappingSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { saveMapping } from "@/lib/import/batch-service";
import { detectColumns, validateMapping, type ColumnMapping } from "@/lib/import/mapping";

/**
 * GET /api/imports/[id]/mapping - current detections + stored mapping.
 * POST /api/imports/[id]/mapping - persist the operator confirmed mapping.
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: { id: true, status: true, columnMapping: true, detectedColumns: true },
    });
    if (!batch) return jsonError(404, "Import not found.");

    return jsonOk({
      status: batch.status,
      mapping: (batch.columnMapping ?? {}) as ColumnMapping,
      detectedColumns: batch.detectedColumns ?? [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;

    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: { id: true, status: true, detectedColumns: true },
    });
    if (!batch) return jsonError(404, "Import not found.");
    if (batch.status === "IMPORTED" || batch.status === "CANCELLED") {
      return jsonError(409, "This import can no longer be remapped.");
    }

    const body = await readJsonBody<unknown>(request);
    const parsed = MappingSchema.parse(body);

    // Headers come from the stored detections so the client cannot invent them.
    const detections = detectColumns(
      (batch.detectedColumns as Array<{ sourceHeader: string }> | null)?.map(
        (column) => column.sourceHeader,
      ) ?? Object.keys(parsed.mapping),
    );

    const validation = validateMapping(
      parsed.mapping as ColumnMapping,
      detections.map((detection) => detection.sourceHeader),
    );

    if (!validation.ok) {
      return jsonError(400, "Mapping is not valid.", {
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const needsConfirmation = detections.some(
      (detection) => detection.ambiguous || detection.conflict || detection.requiresConfirmation,
    );
    if (needsConfirmation && !parsed.confirmed) {
      return jsonError(409, "Ambiguous columns need explicit confirmation.", {
        warnings: validation.warnings,
        ambiguous: detections
          .filter((detection) => detection.ambiguous || detection.conflict)
          .map((detection) => ({
            sourceHeader: detection.sourceHeader,
            suggestion: detection.suggestion,
            confidence: detection.confidence,
            reason: detection.reason,
          })),
      });
    }

    await saveMapping({ batchId: id, mapping: parsed.mapping as ColumnMapping });

    return jsonOk({ ok: true, warnings: validation.warnings });
  } catch (error) {
    return handleApiError(error);
  }
}
