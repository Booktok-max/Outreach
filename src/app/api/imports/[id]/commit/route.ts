import { handleApiError, jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { CommitSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { commitBatch } from "@/lib/import/commit-service";

/**
 * POST /api/imports/[id]/commit - CONFIRM + IMPORT.
 * Writes the reviewed VALID rows into the canonical tables.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const body = await readJsonBody<unknown>(request);
    const parsed = CommitSchema.parse(body);

    const result = await commitBatch(id, {
      includeExistingEmailRows: parsed.includeExistingEmailRows,
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** GET returns the current state (used to detect a re-entrant import). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: { id: true, status: true, importedRows: true, failureMessage: true },
    });
    if (!batch) return jsonError(404, "Import not found.");
    return jsonOk(batch);
  } catch (error) {
    return handleApiError(error);
  }
}
