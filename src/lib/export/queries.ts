import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { ContactExportRecord, ExportSummary } from "@/lib/export/datasets";
import { summarizeExport } from "@/lib/export/datasets";
import { buildLeadWhere } from "@/lib/leads/where";

/**
 * Loads export records from the database.
 *
 * Records are read in pages so a 5,000 contact export never materialises the
 * whole table in memory at once, and the selected filters are always shown back
 * to the operator before a file is generated.
 */

export type ExportScope = "default" | "all" | "filtered" | "selected";
export type BookSelection = "primary" | "all";

export interface ExportQuery {
  scope?: ExportScope;
  personIds?: string[];
  filters?: {
    search?: string;
    batchId?: string;
    genre?: string;
    emailStatus?: string;
    outreachStatus?: string;
  };
  bookSelection?: BookSelection;
}

const PAGE_SIZE = 500;

function scopeWhere(query: ExportQuery): Prisma.PersonWhereInput {
  if (query.scope === "selected") {
    const ids = (query.personIds ?? []).slice(0, 10000);
    return { id: { in: ids } };
  }

  if (query.scope === "filtered" && query.filters) {
    return buildLeadWhere(query.filters);
  }

  if (query.scope === "all") return {};

  // "default" is the GMass rule: approved + valid email + never suppressed.
  return {
    emailStatus: "VALID",
    primaryEmail: { not: null },
    outreach: { is: { status: "APPROVED" } },
  };
}

const RECORD_SELECT = {
  id: true,
  primaryEmail: true,
  emailStatus: true,
  firstName: true,
  lastName: true,
  fullName: true,
  penName: true,
  organization: true,
  role: true,
  websiteUrl: true,
  twitterUrl: true,
  instagramUrl: true,
  facebookUrl: true,
  linkedinUrl: true,
  tiktokUrl: true,
  goodreadsUrl: true,
  outreach: { select: { status: true, suppressionReason: true } },
  books: {
    select: {
      isPrimaryBook: true,
      role: true,
      book: {
        select: {
          id: true,
          title: true,
          subtitle: true,
          seriesName: true,
          seriesPosition: true,
          genre: true,
          description: true,
          bookUrl: true,
          amazonUrl: true,
          isbn: true,
          publisher: true,
          bookFormat: true,
          language: true,
          publicationDate: true,
        },
      },
    },
    orderBy: [{ isPrimaryBook: "desc" }, { createdAt: "asc" }] as Prisma.Person$booksArgs["orderBy"],
    take: 5,
  },
  importRows: {
    orderBy: { createdAt: "asc" } as Prisma.Person$importRowsArgs["orderBy"],
    take: 1,
    select: {
      rowNumber: true,
      createdAt: true,
      importBatch: { select: { filename: true } },
    },
  },
} satisfies Prisma.PersonSelect;

type PersonRecord = Prisma.PersonGetPayload<{ select: typeof RECORD_SELECT }>;

function toExportRecord(
  person: PersonRecord,
  bookSelection: BookSelection,
): ContactExportRecord[] {
  const provenance = person.importRows[0] ?? null;
  const links = person.books;

  const booksToEmit =
    bookSelection === "all"
      ? links.length > 0
        ? links
        : [null]
      : [links[0] ?? null];

  return booksToEmit.map((link) => ({
    personId: person.id,
    email: person.primaryEmail,
    emailStatus: (person.emailStatus as ContactExportRecord["emailStatus"]) ?? null,
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: person.fullName,
    authorName: person.penName,
    penName: person.penName,
    organization: person.organization,
    role: person.role,
    websiteUrl: person.websiteUrl,
    twitterUrl: person.twitterUrl,
    instagramUrl: person.instagramUrl,
    facebookUrl: person.facebookUrl,
    linkedinUrl: person.linkedinUrl,
    tiktokUrl: person.tiktokUrl,
    goodreadsUrl: person.goodreadsUrl,
    outreachStatus: (person.outreach?.status as ContactExportRecord["outreachStatus"]) ?? "PENDING",
    suppressionReason: person.outreach?.suppressionReason ?? null,
    bookId: link?.book.id ?? null,
    bookTitle: link?.book.title ?? null,
    bookSubtitle: link?.book.subtitle ?? null,
    seriesName: link?.book.seriesName ?? null,
    seriesPosition: link?.book.seriesPosition ?? null,
    genre: link?.book.genre ?? null,
    description: link?.book.description ?? null,
    bookUrl: link?.book.bookUrl ?? null,
    amazonUrl: link?.book.amazonUrl ?? null,
    isbn: link?.book.isbn ?? null,
    publisher: link?.book.publisher ?? null,
    publicationDate: link?.book.publicationDate
      ? link.book.publicationDate.toISOString().slice(0, 10)
      : null,
    bookFormat: link?.book.bookFormat ?? null,
    language: link?.book.language ?? null,
    bookRole: link?.role ?? null,
    sourceFile: provenance?.importBatch.filename ?? null,
    sourceRow: provenance?.rowNumber ?? null,
    importedAt: provenance ? provenance.createdAt.toISOString() : null,
  }));
}

/** Streams the matching people in pages and flattens them into export rows. */
export async function fetchExportRecords(query: ExportQuery = {}): Promise<ContactExportRecord[]> {
  const where = scopeWhere(query);
  const bookSelection = query.bookSelection ?? "primary";
  const records: ContactExportRecord[] = [];

  let cursor: string | null = null;

  for (;;) {
    const page: PersonRecord[] = await prisma.person.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: RECORD_SELECT,
    });

    if (page.length === 0) break;

    for (const person of page) {
      records.push(...toExportRecord(person, bookSelection));
    }

    cursor = page[page.length - 1]?.id ?? null;
    if (page.length < PAGE_SIZE) break;
  }

  return records;
}

/**
 * Pre-export confirmation numbers. Cheap aggregate queries for the global
 * scopes; exact record scanning when a specific selection is exported.
 */
export async function getExportSummary(query: ExportQuery = {}): Promise<ExportSummary> {
  if (query.scope === "selected" || query.scope === "filtered") {
    return summarizeExport(await fetchExportRecords({ ...query, bookSelection: "primary" }));
  }

  const where = scopeWhere(query);

  const [total, ready, valid, suppressed, rejected, missingEmail] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.count({ where: scopeWhere({ ...query, scope: "default" }) }),
    prisma.person.count({ where: { ...where, emailStatus: "VALID" } }),
    prisma.person.count({ where: { ...where, outreach: { is: { status: "SUPPRESSED" } } } }),
    prisma.person.count({ where: { ...where, outreach: { is: { status: "REJECTED" } } } }),
    prisma.person.count({ where: { ...where, primaryEmail: null } }),
  ]);

  return {
    ready,
    reviewed: total,
    valid,
    invalidEmail: Math.max(0, total - valid - missingEmail),
    suppressed,
    rejected,
    missingEmail,
  };
}


