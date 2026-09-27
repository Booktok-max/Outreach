import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { validateBatch } from "@/lib/import/validation-service";

/**
 * POST /api/imports/[id]/validate - VALIDATE + DEDUPLICATE.
 * Recomputes verdicts for every staged row and returns the counts.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: { id: true, status: true, columnMapping: true },
    });
    if (!batch) return jsonError(404, "Import not found.");
    if (batch.status === "IMPORTED" || batch.status === "CANCELLED") {
      return jsonError(409, "This import can no longer be validated.");
    }
    if (!batch.columnMapping) {
      return jsonError(409, "Confirm the column mapping before validating.");
    }

    const result = await validateBatch(id);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
