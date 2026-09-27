import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import { buildLeadWhere } from "./where";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type LeadListFilters,
  type LeadListItem,
  type LeadListPage,
} from "./types";

/**
 * Server side lead queries.
 *
 * Pagination, search and filters are all evaluated by PostgreSQL: the browser
 * never receives more than one page of records, which keeps a 5,000 contact
 * database responsive.
 */

const LIST_SELECT = {
  id: true,
  fullName: true,
  penName: true,
  primaryEmail: true,
  emailStatus: true,
  organization: true,
  role: true,
  outreach: { select: { status: true, suppressionReason: true } },
  books: {
    select: {
      isPrimaryBook: true,
      book: { select: { title: true, seriesName: true, genre: true } },
    },
    orderBy: [{ isPrimaryBook: "desc" }, { createdAt: "asc" }],
    take: 3,
  },
  importRows: {
    select: {
      rowNumber: true,
      createdAt: true,
      importBatch: { select: { filename: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 1,
  },
} satisfies Prisma.PersonSelect;

export interface ListLeadsInput {
  search?: string | undefined;
  batchId?: string | undefined;
  genre?: string | undefined;
  emailStatus?: string | undefined;
  outreachStatus?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export async function listLeads(input: ListLeadsInput): Promise<LeadListPage> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE)));

  const where = buildLeadWhere(input);

  const [total, people] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: LIST_SELECT,
    }),
  ]);

  const items: LeadListItem[] = people.map((person) => {
    const primaryBook = person.books[0]?.book ?? null;
    const provenance = person.importRows[0] ?? null;

    return {
      id: person.id,
      fullName: person.fullName ?? person.penName,
      email: person.primaryEmail,
      emailStatus: person.emailStatus,
      organization: person.organization,
      role: person.role,
      outreachStatus: person.outreach?.status ?? "PENDING",
      suppressionReason: person.outreach?.suppressionReason ?? null,
      bookTitle: primaryBook?.title ?? null,
      seriesName: primaryBook?.seriesName ?? null,
      genre: primaryBook?.genre ?? null,
      sourceFile: provenance?.importBatch.filename ?? null,
      sourceRow: provenance?.rowNumber ?? null,
      importedAt: provenance ? provenance.createdAt.toISOString() : null,
    };
  });

  const filters: LeadListFilters = {
    search: input.search ?? "",
    batchId: input.batchId ?? null,
    genre: input.genre ?? null,
    emailStatus: (input.emailStatus as LeadListFilters["emailStatus"]) ?? "all",
    outreachStatus: (input.outreachStatus as LeadListFilters["outreachStatus"]) ?? "all",
  };

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    filters,
  };
}

/** Distinct genres used by the filter dropdown (cheap on an indexed column). */
export async function listGenres(): Promise<string[]> {
  const books = await prisma.book.findMany({
    where: { genre: { not: null } },
    distinct: ["genre"],
    select: { genre: true },
    orderBy: { genre: "asc" },
    take: 200,
  });
  return books
    .map((book) => book.genre)
    .filter((genre): genre is string => Boolean(genre));
}
