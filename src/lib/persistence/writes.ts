import { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { NormalizedRow } from "@/lib/domain/types";
import { buildSearchText } from "@/lib/domain/values";

/**
 * The single write path for canonical records.
 *
 * Every import, edit and bulk action goes through these helpers so that the
 * derived caches on `person` (primary email, email status, search text) and
 * `book` (search text) can never drift from the underlying tables.
 */

export type DbClient = PrismaClient | Prisma.TransactionClient;

/** Fill-only update payload: existing values are never overwritten. */
function fillOnly(
  current: Record<string, unknown>,
  incoming: Record<string, string | Date | number | null | undefined>,
): Record<string, string | Date | number> {
  const patch: Record<string, string | Date | number> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") continue;
    const existing = current[key];
    if (existing === null || existing === undefined || existing === "") {
      patch[key] = value;
    }
  }
  return patch;
}

export interface PersonUpsertResult {
  personId: string;
  created: boolean;
}

/**
 * Finds or creates the person for a normalized row, keyed by normalized email.
 * Existing profiles are completed with missing fields but never overwritten.
 */
export async function upsertPersonFromRow(
  db: DbClient,
  row: NormalizedRow,
): Promise<PersonUpsertResult> {
  const emailNormalized = row.email?.normalized ?? null;

  let existingId: string | null = null;
  if (emailNormalized) {
    const contact = await db.contactPoint.findUnique({
      where: { type_normalizedValue: { type: "EMAIL", normalizedValue: emailNormalized } },
      select: { personId: true },
    });
    existingId = contact?.personId ?? null;
  }

  const personData = {
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    organization: row.organization,
    role: row.role,
    notes: row.notes,
    websiteUrl: row.urls.websiteUrl?.normalized ?? null,
    twitterUrl: row.urls.twitterUrl?.normalized ?? null,
    instagramUrl: row.urls.instagramUrl?.normalized ?? null,
    facebookUrl: row.urls.facebookUrl?.normalized ?? null,
    linkedinUrl: row.urls.linkedinUrl?.normalized ?? null,
    tiktokUrl: row.urls.tiktokUrl?.normalized ?? null,
    goodreadsUrl: row.urls.goodreadsUrl?.normalized ?? null,
  };

  let personId: string;
  let created = false;

  if (existingId) {
    personId = existingId;
    const current = await db.person.findUniqueOrThrow({
      where: { id: personId },
      select: {
        firstName: true,
        lastName: true,
        fullName: true,
        organization: true,
        role: true,
        notes: true,
        websiteUrl: true,
        twitterUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        linkedinUrl: true,
        tiktokUrl: true,
        goodreadsUrl: true,
      },
    });
    const patch = fillOnly(current, personData);
    if (Object.keys(patch).length > 0) {
      await db.person.update({ where: { id: personId }, data: patch });
    }
  } else {
    const person = await db.person.create({ data: personData });
    personId = person.id;
    created = true;
  }

  // A distinct author/pen name is recorded separately from the contact name.
  if (row.authorName && row.fullName && row.authorName !== row.fullName) {
    await db.person.updateMany({
      where: { id: personId, OR: [{ penName: null }, { penName: "" }] },
      data: { penName: row.authorName },
    });
  }

  await syncContactPoints(db, personId, row);
  await refreshPersonCaches(db, personId);

  return { personId, created };
}

interface ContactPointInput {
  type: "EMAIL" | "WEBSITE" | "PHONE" | "SOCIAL";
  value: string;
  normalizedValue: string;
  status: "UNKNOWN" | "VALID" | "INVALID";
  validationMessage: string | null;
  label: string | null;
}

/** Creates or refreshes the contact points of a row (email, website, socials). */
export async function syncContactPoints(
  db: DbClient,
  personId: string,
  row: NormalizedRow,
): Promise<void> {
  if (row.email) {
    await upsertContactPoint(db, personId, {
      type: "EMAIL",
      value: row.email.value,
      normalizedValue: row.email.normalized,
      status: row.email.valid ? "VALID" : "INVALID",
      validationMessage: row.email.valid ? null : (row.email.reason ?? "invalid email address"),
      label: "primary email",
    });
  }

  if (row.phone) {
    await upsertContactPoint(db, personId, {
      type: "PHONE",
      value: row.phone,
      normalizedValue: row.phone,
      status: "VALID",
      validationMessage: null,
      label: "phone",
    });
  }

  const socials: Array<[ContactPointInput["type"], string | undefined, string]> = [
    ["WEBSITE", row.urls.websiteUrl?.normalized, "website"],
    ["SOCIAL", row.urls.twitterUrl?.normalized, "twitter"],
    ["SOCIAL", row.urls.instagramUrl?.normalized, "instagram"],
    ["SOCIAL", row.urls.facebookUrl?.normalized, "facebook"],
    ["SOCIAL", row.urls.linkedinUrl?.normalized, "linkedin"],
    ["SOCIAL", row.urls.tiktokUrl?.normalized, "tiktok"],
    ["SOCIAL", row.urls.goodreadsUrl?.normalized, "goodreads"],
  ];

  for (const [type, normalizedValue, label] of socials) {
    if (!normalizedValue) continue;
    await upsertContactPoint(db, personId, {
      type,
      value: normalizedValue,
      normalizedValue,
      status: "VALID",
      validationMessage: null,
      label,
    });
  }
}

/**
 * Inserts a contact point unless the same normalized value is already on file.
 * A value owned by a different person is left untouched - the caller reports it
 * instead of silently stealing the value from the other record.
 */
async function upsertContactPoint(
  db: DbClient,
  personId: string,
  input: ContactPointInput,
): Promise<void> {
  const existing = await db.contactPoint.findUnique({
    where: {
      type_normalizedValue: { type: input.type, normalizedValue: input.normalizedValue },
    },
    select: { id: true, personId: true },
  });

  if (existing) {
    if (existing.personId === personId) {
      await db.contactPoint.update({
        where: { id: existing.id },
        data: { status: input.status, validationMessage: input.validationMessage },
      });
    }
    return;
  }

  await db.contactPoint.create({
    data: {
      personId,
      type: input.type,
      value: input.value,
      normalizedValue: input.normalizedValue,
      status: input.status,
      validationMessage: input.validationMessage,
      label: input.label,
      isPrimary: input.type === "EMAIL",
    },
  });
}

/** Recomputes the derived person caches (primary email, status, search text). */
export async function refreshPersonCaches(db: DbClient, personId: string): Promise<void> {
  const person = await db.person.findUnique({
    where: { id: personId },
    select: {
      firstName: true,
      lastName: true,
      fullName: true,
      penName: true,
      organization: true,
      primaryEmail: true,
      emailStatus: true,
      books: { select: { book: { select: { title: true, seriesName: true } } } },
      contactPoints: {
        where: { type: "EMAIL" },
        select: { normalizedValue: true, status: true, isPrimary: true, createdAt: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!person) return;

  const primaryContact = person.contactPoints[0] ?? null;
  const primaryEmail = primaryContact?.normalizedValue ?? null;
  const emailStatus = primaryContact ? primaryContact.status : null;

  const searchText = buildSearchText([
    person.fullName,
    person.firstName,
    person.lastName,
    person.penName,
    primaryEmail,
    person.organization,
    ...person.books.map((link) => link.book.title),
    ...person.books.map((link) => link.book.seriesName),
  ]);

  await db.person.update({
    where: { id: personId },
    data: { primaryEmail, emailStatus, searchText },
  });
}

export interface BookUpsertResult {
  bookId: string | null;
  created: boolean;
}

/** Finds or creates the book of a normalized row, keyed by title + lead author. */
export async function upsertBookFromRow(
  db: DbClient,
  row: NormalizedRow,
): Promise<BookUpsertResult> {
  if (!row.bookTitle || !row.bookQuickKey) return { bookId: null, created: false };

  const normalizedTitle = row.bookTitle.toLowerCase().replace(/\s+/g, " ").trim();

  const existing = await db.book.findUnique({
    where: { quickKey: row.bookQuickKey },
    select: { id: true },
  });

  const bookData = {
    title: row.bookTitle,
    subtitle: row.bookSubtitle,
    seriesName: row.seriesName,
    seriesPosition: row.seriesPosition,
    genre: row.genre,
    description: row.description,
    bookUrl: row.urls.bookUrl?.normalized ?? null,
    amazonUrl: row.urls.amazonUrl?.normalized ?? null,
    isbn: row.isbn,
    publisher: row.publisher,
    bookFormat: row.bookFormat,
    language: row.language,
    publicationDate: row.publicationDate ? new Date(row.publicationDate) : null,
  };

  if (existing) {
    const current = await db.book.findUniqueOrThrow({
      where: { id: existing.id },
      select: {
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
    });

    const patch = fillOnly(current, {
      subtitle: bookData.subtitle,
      seriesName: bookData.seriesName,
      genre: bookData.genre,
      description: bookData.description,
      bookUrl: bookData.bookUrl,
      amazonUrl: bookData.amazonUrl,
      isbn: bookData.isbn,
      publisher: bookData.publisher,
      bookFormat: bookData.bookFormat,
      language: bookData.language,
    });

    if (Object.keys(patch).length > 0) {
      await db.book.update({ where: { id: existing.id }, data: patch });
    }

    await refreshBookSearchText(db, existing.id);
    return { bookId: existing.id, created: false };
  }

  const book = await db.book.create({
    data: {
      title: bookData.title,
      subtitle: bookData.subtitle,
      normalizedTitle,
      quickKey: row.bookQuickKey,
      primaryAuthorName: row.authorName ?? row.fullName,
      seriesName: bookData.seriesName,
      seriesPosition: bookData.seriesPosition,
      genre: bookData.genre,
      description: bookData.description,
      bookUrl: bookData.bookUrl,
      amazonUrl: bookData.amazonUrl,
      isbn: bookData.isbn,
      publisher: bookData.publisher,
      bookFormat: bookData.bookFormat,
      language: bookData.language,
      publicationDate: bookData.publicationDate,
    },
  });

  await refreshBookSearchText(db, book.id);
  return { bookId: book.id, created: true };
}

export async function refreshBookSearchText(db: DbClient, bookId: string): Promise<void> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: {
      title: true,
      subtitle: true,
      seriesName: true,
      primaryAuthorName: true,
      isbn: true,
      genre: true,
    },
  });
  if (!book) return;

  const searchText = buildSearchText([
    book.title,
    book.subtitle,
    book.seriesName,
    book.primaryAuthorName,
    book.isbn,
    book.genre,
  ]);

  await db.book.update({ where: { id: bookId }, data: { searchText } });
}

/** Links a person to a book; the first book of a person becomes their primary. */
export async function linkPersonBook(
  db: DbClient,
  personId: string,
  bookId: string,
  role: "AUTHOR" | "CO_AUTHOR" | "EDITOR" | "CONTRIBUTOR" | "ILLUSTRATOR" | "TRANSLATOR" | "PUBLISHER" | "AGENT" = "AUTHOR",
): Promise<{ created: boolean; personBookId: string }> {
  const existing = await db.personBook.findUnique({
    where: { personId_bookId_role: { personId, bookId, role } },
    select: { id: true },
  });

  if (existing) return { created: false, personBookId: existing.id };

  const primaryCount = await db.personBook.count({ where: { personId, isPrimaryBook: true } });

  const link = await db.personBook.create({
    data: { personId, bookId, role, isPrimaryBook: primaryCount === 0 },
  });

  return { created: true, personBookId: link.id };
}


