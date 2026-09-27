import { handleApiError, jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { LeadEditSchema } from "@/lib/api/schemas";
import { LeadEditError, updateLead } from "@/lib/leads/edit";

/**
 * PATCH /api/leads/[id] - record editing.
 * Validation runs server side; the browser never mutates state directly.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = LeadEditSchema.parse(await readJsonBody<unknown>(request));

    await updateLead(id, parsed);
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof LeadEditError) {
      return jsonError(400, "Some fields need attention.", { issues: error.issues });
    }
    return handleApiError(error);
  }
}
