import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { PreviewQuerySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { getBatchPreview, getBatchSummary } from "@/lib/import/validation-service";

/**
 * GET /api/imports/[id]/preview?filter=all|valid|invalid|duplicate&page=1
 * Server side pagination: at most `pageSize` (<= 100) rows cross the wire.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!batch) return jsonError(404, "Import not found.");

    const url = new URL(request.url);
    const parsed = PreviewQuerySchema.parse({
      filter: url.searchParams.get("filter") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    const [preview, summary] = await Promise.all([
      getBatchPreview(id, parsed),
      getBatchSummary(id),
    ]);

    return jsonOk({ status: batch.status, summary, ...preview });
  } catch (error) {
    return handleApiError(error);
  }
}
