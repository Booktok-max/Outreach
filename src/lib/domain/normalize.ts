import type { CanonicalValues } from "@/lib/import/mapping";
import { cleanSingleLine } from "@/lib/text";

import type { NormalizedRow, NormalizedUrl, UrlField } from "./types";
import {
  buildBookQuickKey,
  buildFullName,
  normalizeDescription,
  normalizeEmail,
  normalizeIsbn,
  normalizePhone,
  normalizePublicationDate,
  normalizeSeriesPosition,
  normalizeUrl,
  parseFullName,
} from "./values";

/**
 * Deterministic 64-bit FNV-1a hash used for row fingerprints.
 * Fingerprints only need to be stable and collision resistant enough to detect
 * identical source rows - they are never used for security decisions.
 */
export function hashValue(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

const URL_FIELD_KEYS: UrlField[] = [
  "websiteUrl",
  "twitterUrl",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
  "tiktokUrl",
  "goodreadsUrl",
  "bookUrl",
  "amazonUrl",
];

/** Fields that participate in the duplicate-source-row fingerprint. */
const FINGERPRINT_FIELDS = [
  "email",
  "fullName",
  "authorName",
  "firstName",
  "lastName",
  "organization",
  "role",
  "phone",
  "websiteUrl",
  "twitterUrl",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
  "tiktokUrl",
  "goodreadsUrl",
  "bookTitle",
  "subtitle",
  "seriesName",
  "seriesPosition",
  "genre",
  "description",
  "bookUrl",
  "amazonUrl",
  "isbn",
  "publisher",
  "publicationDate",
  "bookFormat",
  "language",
  "notes",
] as const;

/** Builds the fingerprint of a normalized row (case/whitespace insensitive). */
export function buildSourceFingerprint(values: CanonicalValues): string {
  const parts: string[] = [];
  for (const field of FINGERPRINT_FIELDS) {
    const value = values[field];
    if (!value) continue;
    parts.push(`${field}=${value.toLowerCase().replace(/\s+/g, " ").trim()}`);
  }
  if (parts.length === 0) return hashValue("empty");
  return hashValue(parts.join("|"));
}

/** `<normalized email>|<book quick key>` - de-duplicates person/book links. */
export function buildIdentityKey(
  emailNormalized: string | null,
  bookQuickKey: string | null,
): string | null {
  if (!emailNormalized || !bookQuickKey) return null;
  return `${emailNormalized}|${bookQuickKey}`;
}

function cleanOrNull(value: string | undefined): string | null {
  return cleanSingleLine(value);
}

/**
 * Normalizes canonical (mapped) values into the shape used by validation,
 * de-duplication, persistence and export.
 */
export function normalizeCanonicalValues(values: CanonicalValues): NormalizedRow {
  const email = normalizeEmail(values.email);

  const urls: Partial<Record<UrlField, NormalizedUrl>> = {};
  for (const field of URL_FIELD_KEYS) {
    const raw = values[field];
    if (!raw) continue;

    const normalized = normalizeUrl(raw);
    if (normalized) urls[field] = normalized;
  }

  const parsed = parseFullName(values.fullName ?? values.authorName);
  const firstName = cleanOrNull(values.firstName) ?? parsed.firstName;
  const lastName = cleanOrNull(values.lastName) ?? parsed.lastName;
  const explicitFullName = cleanOrNull(values.fullName);
  const explicitAuthorName = cleanOrNull(values.authorName);

  const fullName =
    explicitFullName ?? buildFullName(firstName, lastName) ?? parsed.fullName ?? explicitAuthorName;
  const authorName = explicitAuthorName ?? fullName;

  const bookTitle = cleanOrNull(values.bookTitle);
  const bookQuickKey = buildBookQuickKey(bookTitle, authorName ?? fullName);

  return {
    values,
    email,
    urls,
    fullName,
    firstName,
    lastName,
    authorName,
    bookTitle,
    bookSubtitle: cleanOrNull(values.subtitle),
    bookQuickKey,
    seriesName: cleanOrNull(values.seriesName),
    seriesPosition: normalizeSeriesPosition(values.seriesPosition),
    genre: cleanOrNull(values.genre),
    description: normalizeDescription(values.description),
    publisher: cleanOrNull(values.publisher),
    isbn: normalizeIsbn(values.isbn),
    bookFormat: cleanOrNull(values.bookFormat),
    language: cleanOrNull(values.language),
    publicationDate: normalizePublicationDate(values.publicationDate),
    organization: cleanOrNull(values.organization),
    role: cleanOrNull(values.role),
    phone: normalizePhone(values.phone),
    notes: cleanOrNull(values.notes),
    sourceFingerprint: buildSourceFingerprint(values),
    identityKey: buildIdentityKey(email?.normalized ?? null, bookQuickKey),
  };
}
