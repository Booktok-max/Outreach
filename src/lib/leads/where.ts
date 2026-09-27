import { Prisma } from "@/generated/prisma/client";

/**
 * Builds the `where` clause for the lead browser.
 *
 * Search runs against the derived `person.search_text` column (name, email,
 * organization and book titles) which is indexed, so no full table scan and no
 * client side filtering is required.
 */
export function buildLeadWhere(query: {
  search?: string | undefined;
  batchId?: string | undefined;
  genre?: string | undefined;
  emailStatus?: string | undefined;
  outreachStatus?: string | undefined;
}): Prisma.PersonWhereInput {
  const where: Prisma.PersonWhereInput = {};
  const conditions: Prisma.PersonWhereInput[] = [];

  const search = (query.search ?? "").trim().toLowerCase();
  if (search.length > 0) {
    conditions.push({
      OR: [
        { searchText: { contains: search } },
        { primaryEmail: { contains: search } },
        { organization: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (query.batchId) {
    conditions.push({ importRows: { some: { importBatchId: query.batchId } } });
  }

  if (query.genre) {
    conditions.push({ books: { some: { book: { genre: query.genre } } } });
  }

  switch (query.emailStatus) {
    case "VALID":
      conditions.push({ emailStatus: "VALID" });
      break;
    case "INVALID":
      conditions.push({ emailStatus: "INVALID" });
      break;
    case "UNKNOWN":
      conditions.push({ emailStatus: "UNKNOWN" });
      break;
    case "MISSING":
      conditions.push({ primaryEmail: null });
      break;
    default:
      break;
  }

  switch (query.outreachStatus) {
    case "PENDING":
      conditions.push({ outreach: { is: { status: "PENDING" } } });
      break;
    case "APPROVED":
      conditions.push({ outreach: { is: { status: "APPROVED" } } });
      break;
    case "REJECTED":
      conditions.push({ outreach: { is: { status: "REJECTED" } } });
      break;
    case "SUPPRESSED":
      conditions.push({ outreach: { is: { status: "SUPPRESSED" } } });
      break;
    default:
      break;
  }

  if (conditions.length === 0) return where;
  return { AND: conditions };
}

/** Only approved, valid, non suppressed contacts - the GMass default filter. */
export function buildExportableWhere(): Prisma.PersonWhereInput {
  return {
    emailStatus: "VALID",
    primaryEmail: { not: null },
    outreach: { is: { status: "APPROVED" } },
  };
}
