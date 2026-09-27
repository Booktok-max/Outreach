import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { getSession } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { stageImport } from "@/lib/import/batch-service";

/**
 * POST /api/imports - UPLOAD + INSPECT.
 *
 * The file is parsed server side, its columns are inspected and every row is
 * staged as an ImportRow. No canonical record is created here: the operator
 * must confirm the mapping, review the preview and explicitly import.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return jsonError(401, "Authentication required.");

    const env = getEnv();

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return jsonError(400, "Attach a .csv or .xlsx file to import.");
    }
    if (file.size === 0) {
      return jsonError(400, "The uploaded file is empty.");
    }
    if (file.size > env.MAX_UPLOAD_BYTES) {
      return jsonError(
        413,
        `File is larger than the ${Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024))} MB upload limit.`,
      );
    }

    const rawSheet = form.get("sheetName");
    const sheetName =
      typeof rawSheet === "string" && rawSheet.trim().length > 0 ? rawSheet.trim() : undefined;

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await stageImport({
      filename: file.name || "upload",
      mimeType: file.type || null,
      buffer,
      sheetName,
      createdBy: session.sub,
    });

    if (result.outcome === "sheet_selection_required") {
      // 409 = "this workbook has multiple worksheets, pick one and re-upload".
      return jsonOk(result, 409);
    }

    return jsonOk(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
