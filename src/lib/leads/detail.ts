import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";

export interface LeadBookDetail {
  id: string;
  title: string;
  subtitle: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
  genre: string | null;
  description: string | null;
  bookUrl: string | null;
  amazonUrl: string | null;
  isbn: string | null;
  publisher: string | null;
  bookFormat: string | null;
  language: string | null;
  publicationDate: string | null;
  role: string;
  isPrimaryBook: boolean;
}

export interface LeadDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  penName: string | null;
  organization: string | null;
  role: string | null;
  notes: string | null;
  primaryEmail: string | null;
  emailStatus: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  tiktokUrl: string | null;
  goodreadsUrl: string | null;
  createdAt: string;
  updatedAt: string;
  contactPoints: Array<{
    id: string;
    type: string;
    value: string;
    label: string | null;
    status: string;
    validationMessage: string | null;
  }>;
  books: LeadBookDetail[];
  outreach: {
    status: string;
    suppressionReason: string | null;
    notes: string | null;
    decisionNote: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  } | null;
  events: Array<{
    id: string;
    type: string;
    fromState: string | null;
    toState: string;
    reason: string | null;
    note: string | null;
    actor: string | null;
    createdAt: string;
  }>;
  provenance: {
    sourceFile: string | null;
    sourceRow: number | null;
    importDate: string | null;
    batchId: string | null;
    rowStatus: string | null;
  } | null;
}

const DETAIL_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  penName: true,
  organization: true,
  role: true,
  notes: true,
  primaryEmail: true,
  emailStatus: true,
  websiteUrl: true,
  twitterUrl: true,
  instagramUrl: true,
  facebookUrl: true,
  linkedinUrl: true,
  tiktokUrl: true,
  goodreadsUrl: true,
  createdAt: true,
  updatedAt: true,
  contactPoints: {
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      value: true,
      label: true,
      status: true,
      validationMessage: true,
    },
  },
  books: {
    orderBy: [{ isPrimaryBook: "desc" }, { createdAt: "asc" }],
    select: {
      role: true,
      isPrimaryBook: true,
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
  },
  outreach: {
    select: {
      status: true,
      suppressionReason: true,
      notes: true,
      decisionNote: true,
      reviewedBy: true,
      reviewedAt: true,
    },
  },
  outreachEvents: {
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      type: true,
      fromState: true,
      toState: true,
      reason: true,
      note: true,
      actor: true,
      createdAt: true,
    },
  },
  importRows: {
    orderBy: { createdAt: "asc" },
    take: 1,
    select: {
      rowNumber: true,
      status: true,
      createdAt: true,
      importBatch: { select: { id: true, filename: true } },
    },
  },
} satisfies Prisma.PersonSelect;

/** Full record for `/leads/[id]` - everything the detail page must show. */
export async function getLeadDetail(personId: string): Promise<LeadDetail | null> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: DETAIL_SELECT });

  if (!person) return null;

  const provenanceRow = person.importRows[0] ?? null;

  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: person.fullName,
    penName: person.penName,
    organization: person.organization,
    role: person.role,
    notes: person.notes,
    primaryEmail: person.primaryEmail,
    emailStatus: person.emailStatus,
    websiteUrl: person.websiteUrl,
    twitterUrl: person.twitterUrl,
    instagramUrl: person.instagramUrl,
    facebookUrl: person.facebookUrl,
    linkedinUrl: person.linkedinUrl,
    tiktokUrl: person.tiktokUrl,
    goodreadsUrl: person.goodreadsUrl,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
    contactPoints: person.contactPoints.map((point) => ({
      id: point.id,
      type: point.type,
      value: point.value,
      label: point.label,
      status: point.status,
      validationMessage: point.validationMessage,
    })),
    books: person.books.map((link) => ({
      id: link.book.id,
      title: link.book.title,
      subtitle: link.book.subtitle,
      seriesName: link.book.seriesName,
      seriesPosition: link.book.seriesPosition,
      genre: link.book.genre,
      description: link.book.description,
      bookUrl: link.book.bookUrl,
      amazonUrl: link.book.amazonUrl,
      isbn: link.book.isbn,
      publisher: link.book.publisher,
      bookFormat: link.book.bookFormat,
      language: link.book.language,
      publicationDate: link.book.publicationDate
        ? link.book.publicationDate.toISOString().slice(0, 10)
        : null,
      role: link.role,
      isPrimaryBook: link.isPrimaryBook,
    })),
    outreach: person.outreach
      ? {
          status: person.outreach.status,
          suppressionReason: person.outreach.suppressionReason,
          notes: person.outreach.notes,
          decisionNote: person.outreach.decisionNote,
          reviewedBy: person.outreach.reviewedBy,
          reviewedAt: person.outreach.reviewedAt ? person.outreach.reviewedAt.toISOString() : null,
        }
      : null,
    events: person.outreachEvents.map((event) => ({
      id: event.id,
      type: event.type,
      fromState: event.fromState,
      toState: event.toState,
      reason: event.reason,
      note: event.note,
      actor: event.actor,
      createdAt: event.createdAt.toISOString(),
    })),
    provenance: provenanceRow
      ? {
          sourceFile: provenanceRow.importBatch.filename,
          sourceRow: provenanceRow.rowNumber,
          importDate: provenanceRow.createdAt.toISOString(),
          batchId: provenanceRow.importBatch.id,
          rowStatus: provenanceRow.status,
        }
      : null,
  };
}


