import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { cancelBatch } from "@/lib/import/batch-service";

/** POST /api/imports/[id]/cancel - abort a staged import (never deletes data). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await cancelBatch(id);

    if (!result.cancelled) {
      if (result.reason === "not_found") return jsonError(404, "Import not found.");
      return jsonError(409, "An imported batch cannot be cancelled.");
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
