import { getSessionFromRequest } from "@/lib/auth";
import { buildCsv } from "@/lib/export/csv";
import {
  fetchUnsubscribedContactsForExport,
  type UnsubscribedSort,
} from "@/lib/unsubscribed";

function parseSort(value: string | null): UnsubscribedSort {
  if (value === "date_asc" || value === "email_asc" || value === "email_desc") {
    return value;
  }
  return "date_desc";
}

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const sort = parseSort(url.searchParams.get("sort"));

  let rows: Array<Array<string | null>>;
  try {
    const contacts = await fetchUnsubscribedContactsForExport({ search, sort });
    rows = contacts.map((contact) => [
      contact.email,
      contact.fullName,
      contact.suppressedAt,
      contact.source,
      contact.suppressionReason,
      contact.status,
      contact.note,
    ]);
  } catch {
    // Never return a partial CSV as if the export had succeeded.
    return Response.json(
      { error: "Failed to export unsubscribed contacts." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers = ["Email", "Name", "SuppressedAt", "Source", "SuppressionReason", "Status", "Context"];

  const csv = buildCsv(headers, rows, { withBom: false });
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="unsubscribed-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
