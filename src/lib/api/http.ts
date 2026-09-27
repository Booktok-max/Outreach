import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ParseError } from "@/lib/import/parsers";
import { DecisionError } from "@/lib/outreach/actions";

/**
 * Small API helpers: consistent JSON errors, safe JSON parsing and a single
 * place where raw database / implementation errors are converted into a
 * generic message so internal details are never exposed to the browser.
 */

export function jsonError(
  status: number,
  error: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    details === undefined ? { error } : { error, details },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function jsonOk(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const KNOWN_ERRORS: Record<string, { status: number; message: string }> = {
  IMPORT_BATCH_NOT_FOUND: { status: 404, message: "Import not found." },
  IMPORT_BATCH_ALREADY_IMPORTED: { status: 409, message: "This import was already completed." },
  IMPORT_BATCH_NOT_VALIDATED: { status: 409, message: "Validate the import before importing it." },
  IMPORT_BATCH_CANCELLED: { status: 409, message: "This import was cancelled." },
  LEAD_NOT_FOUND: { status: 404, message: "Record not found." },
};

/** Converts any thrown value into a safe HTTP response. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ParseError) {
    return jsonError(400, error.message, { code: error.code });
  }

  if (error instanceof DecisionError) {
    return jsonError(400, error.message, { issues: error.issues });
  }

  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return jsonError(400, "Invalid request payload.", issues);
  }

  if (error instanceof Error) {
    const known = KNOWN_ERRORS[error.message];
    if (known) return jsonError(known.status, known.message, { code: error.message });

    if (error.message === "NEXT_REDIRECT") throw error;
  }

  // Log the technical detail server side, never return it to the client.
  console.error("[api] unhandled error:", error instanceof Error ? error.message : error);
  return jsonError(500, "The server could not complete the request.");
}

/** Reads a JSON body with a hard size cap (uploads use multipart instead). */
export async function readJsonBody<T>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new ParseError("MALFORMED", "Request body is too large.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ParseError("MALFORMED", "Request body is not valid JSON.");
  }
}
