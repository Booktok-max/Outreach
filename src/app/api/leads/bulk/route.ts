import { handleApiError, jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { LeadListQuerySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { buildLeadWhere } from "@/lib/leads/where";
import { applyOutreachDecision, DecisionError } from "@/lib/outreach/actions";
import { z } from "zod";

const BulkBodySchema = z.object({
  personIds: z.array(z.string().min(1).max(60)).max(5000).optional(),
  filters: z
    .object({
      search: z.string().max(200).optional(),
      batchId: z.string().max(60).optional(),
      genre: z.string().max(200).optional(),
      emailStatus: z.string().max(20).optional(),
      outreachStatus: z.string().max(20).optional(),
    })
    .optional(),
  action: z.enum(["approve", "reject", "suppress", "unsuppress", "reset"]),
  reason: z
    .enum(["MANUAL", "UNSUBSCRIBE", "PREVIOUS_CLIENT", "DUPLICATE", "INVALID", "DO_NOT_CONTACT"])
    .nullable()
    .optional(),
  note: z.string().max(2000).nullable().optional(),
  /** Count the operator saw in the confirmation dialog. */
  confirmCount: z.number().int().min(0).max(10_000).optional(),
});

/**
 * GET /api/leads - number of records matching the current filters.
 * Used by "select all N matching" without shipping rows to the browser.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = LeadListQuerySchema.parse({
      search: url.searchParams.get("search") ?? undefined,
      batchId: url.searchParams.get("batchId") ?? undefined,
      genre: url.searchParams.get("genre") ?? undefined,
      emailStatus: url.searchParams.get("emailStatus") ?? undefined,
      outreachStatus: url.searchParams.get("outreachStatus") ?? undefined,
    });

    const total = await prisma.person.count({ where: buildLeadWhere(parsed) });
    return jsonOk({ total });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/leads/bulk - approve / reject / suppress a selection.
 * Bulk deletion is intentionally not implemented.
 */
export async function POST(request: Request) {
  try {
    const parsed = BulkBodySchema.parse(await readJsonBody<unknown>(request));

    let personIds = parsed.personIds ?? [];

    if (personIds.length === 0) {
      if (!parsed.filters) return jsonError(400, "Select at least one record.");

      const rows = await prisma.person.findMany({
        where: buildLeadWhere(parsed.filters),
        select: { id: true },
        take: 5000,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      personIds = rows.map((row) => row.id);
    }

    if (personIds.length === 0) return jsonError(400, "No records match this selection.");

    // The count shown in the confirmation dialog must match what we change.
    if (parsed.confirmCount !== undefined && parsed.confirmCount !== personIds.length) {
      return jsonError(
        409,
        `Selection changed: the server will update ${personIds.length} records, not ${parsed.confirmCount}. Review and confirm again.`,
      );
    }

    const result = await applyOutreachDecision({
      personIds,
      action: parsed.action,
      reason: parsed.reason ?? null,
      note: parsed.note ?? null,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof DecisionError) return jsonError(400, error.message, { issues: error.issues });
    return handleApiError(error);
  }
}
