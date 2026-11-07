import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export interface UnsubscribedContactRow {
  personId: string;
  email: string | null;
  fullName: string | null;
  suppressedAt: string | null;
  source: string | null;
  suppressionReason: string | null;
  status: string;
  note: string | null;
}

export type UnsubscribedSort = "date_desc" | "date_asc" | "email_asc" | "email_desc";

export interface ListUnsubscribedInput {
  search?: string | undefined;
  sort?: UnsubscribedSort | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface ExportUnsubscribedInput {
  search?: string | undefined;
  sort?: UnsubscribedSort | undefined;
}

export interface ListUnsubscribedResult {
  items: UnsubscribedContactRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * The dashboard is deliberately paginated at 200 rows per page. Exports use a
 * separate batched path below so they are not subject to that display limit.
 */
const EXPORT_BATCH_SIZE = 500;

const UNSUBSCRIBED_SELECT = {
  id: true,
  personId: true,
  status: true,
  suppressionReason: true,
  source: true,
  decisionNote: true,
  reviewedAt: true,
  person: { select: { primaryEmail: true, fullName: true } },
} satisfies Prisma.OutreachStatusSelect;

type UnsubscribedRecord = Prisma.OutreachStatusGetPayload<{
  select: typeof UNSUBSCRIBED_SELECT;
}>;

function buildWhere(searchInput: string | undefined): Prisma.OutreachStatusWhereInput {
  const search = (searchInput ?? "").trim().toLowerCase();

  const where: Prisma.OutreachStatusWhereInput = {
    status: "SUPPRESSED",
  };

  if (search.length > 0) {
    where.person = {
      OR: [
        { primaryEmail: { contains: search, mode: "insensitive" } },
        { searchText: { contains: search } },
        { fullName: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  return where;
}

/**
 * Every sort includes a unique `id` tie-break. Without it, rows with the same
 * date or email can move between pages/batches, which would make a cursor-based
 * export skip or duplicate records.
 */
function buildOrderBy(sort: UnsubscribedSort): Prisma.OutreachStatusOrderByWithRelationInput[] {
  switch (sort) {
    case "date_asc":
      return [{ reviewedAt: "asc" }, { id: "asc" }];
    case "email_asc":
      return [{ person: { primaryEmail: "asc" } }, { id: "asc" }];
    case "email_desc":
      return [{ person: { primaryEmail: "desc" } }, { id: "desc" }];
    case "date_desc":
    default:
      return [{ reviewedAt: "desc" }, { id: "desc" }];
  }
}

function toUnsubscribedRow(row: UnsubscribedRecord): UnsubscribedContactRow {
  return {
    personId: row.personId,
    email: row.person.primaryEmail,
    fullName: row.person.fullName,
    suppressedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    source: row.source,
    suppressionReason: row.suppressionReason,
    status: row.status,
    note: row.decisionNote,
  };
}

/** Paginated query used by the dashboard. The page size cap is intentional. */
export async function listUnsubscribedContacts(
  input: ListUnsubscribedInput = {},
): Promise<ListUnsubscribedResult> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE)));
  const where = buildWhere(input.search);
  const orderBy = buildOrderBy(input.sort ?? "date_desc");

  const [total, rows] = await Promise.all([
    prisma.outreachStatus.count({ where }),
    prisma.outreachStatus.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: UNSUBSCRIBED_SELECT,
    }),
  ]);

  return {
    total,
    items: rows.map(toUnsubscribedRow),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Reads every suppressed contact matching the filters, in stable batches.
 *
 * There is no silent row cap. The loop continues until the database has no more
 * matching rows; only a genuinely exhausted result set ends the export. Using a
 * cursor on the unique status id (with an id tie-break in every sort) keeps
 * batches stable even when many records share a suppression date or email.
 *
 * Memory use is proportional to the exported result set because the CSV builder
 * needs all rows before it can produce a complete response. That matches the
 * existing export architecture; the database work itself stays batched.
 */
export async function fetchUnsubscribedContactsForExport(
  input: ExportUnsubscribedInput = {},
): Promise<UnsubscribedContactRow[]> {
  const where = buildWhere(input.search);
  const orderBy = buildOrderBy(input.sort ?? "date_desc");
  const rows: UnsubscribedContactRow[] = [];

  let cursor: string | null = null;

  for (;;) {
    const batch: UnsubscribedRecord[] = await prisma.outreachStatus.findMany({
      where,
      orderBy,
      take: EXPORT_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: UNSUBSCRIBED_SELECT,
    });

    if (batch.length === 0) break;

    rows.push(...batch.map(toUnsubscribedRow));

    cursor = batch[batch.length - 1]?.id ?? null;
    if (batch.length < EXPORT_BATCH_SIZE) break;
  }

  return rows;
}
