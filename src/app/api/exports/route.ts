import { handleApiError, jsonOk, readJsonBody } from "@/lib/api/http";
import { ExportRequestSchema } from "@/lib/api/schemas";
import {
  buildGmassDataset,
  buildGeneralDataset,
  selectExportableRecords,
  type GmassOptionalColumn,
} from "@/lib/export/datasets";
import { fetchExportRecords, getExportSummary } from "@/lib/export/queries";
import { buildCsv } from "@/lib/export/csv";
import { buildXlsx } from "@/lib/export/xlsx";

/**
 * POST /api/exports
 *   kind: "gmass"    -> campaign CSV/XLSX (APPROVED + VALID + NOT SUPPRESSED)
 *   kind: "general"  -> canonical export (CSV/XLSX)
 *
 * The response is a file download; nothing is written to disk.
 */
export async function POST(request: Request) {
  try {
    const parsed = ExportRequestSchema.parse(await readJsonBody<unknown>(request));

    const records = await fetchExportRecords({
      scope: parsed.scope,
      personIds: parsed.personIds,
      filters: parsed.filters,
      bookSelection: parsed.bookSelection,
    });

    const exportable =
      parsed.kind === "gmass" ? selectExportableRecords(records) : records;

    const dataset =
      parsed.kind === "gmass"
        ? buildGmassDataset(exportable, {
            optionalColumns: (parsed.optionalColumns ?? []) as GmassOptionalColumn[],
          })
        : buildGeneralDataset(exportable, {
            includeIds: parsed.includeIds,
            includeProvenance: parsed.includeProvenance,
          });

    const stamp = new Date().toISOString().slice(0, 10);

    if (parsed.format === "xlsx") {
      const buffer = await buildXlsx(dataset, parsed.kind === "gmass" ? "GMass" : "Contacts");
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="outreach-${parsed.kind}-${stamp}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csv = buildCsv(dataset.headers, dataset.rows, { withBom: false });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="outreach-${parsed.kind}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** GET /api/exports?scope=... - confirmation numbers before exporting. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search");
    const batchId = url.searchParams.get("batchId");
    const genre = url.searchParams.get("genre");
    const emailStatus = url.searchParams.get("emailStatus");
    const outreachStatus = url.searchParams.get("outreachStatus");

    const scope = (url.searchParams.get("scope") ?? "default") as
      | "default"
      | "all"
      | "filtered"
      | "selected";

    const filters =
      scope === "filtered"
        ? {
            ...(search ? { search } : {}),
            ...(batchId ? { batchId } : {}),
            ...(genre ? { genre } : {}),
            ...(emailStatus ? { emailStatus } : {}),
            ...(outreachStatus ? { outreachStatus } : {}),
          }
        : undefined;

    const summary = await getExportSummary({
      scope,
      personIds: url.searchParams.getAll("personId"),
      filters,
      bookSelection: (url.searchParams.get("bookSelection") as "primary" | "all") ?? "primary",
    });

    return jsonOk(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
