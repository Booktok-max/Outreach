import type { CanonicalField } from "@/lib/import/fields";

import type { CanonicalValues } from "@/lib/import/mapping";

/** Field level problems detected during validation. */
export interface ValidationIssue {
  field: CanonicalField | "row";
  code: string;
  message: string;
}

export type UrlField =
  | "websiteUrl"
  | "twitterUrl"
  | "instagramUrl"
  | "facebookUrl"
  | "linkedinUrl"
  | "tiktokUrl"
  | "goodreadsUrl"
  | "bookUrl"
  | "amazonUrl";

export interface NormalizedUrl {
  /** Original value as supplied by the source row. */
  value: string;
  /** Canonical form used for de-duplication and export. */
  normalized: string;
  valid: boolean;
  reason?: string;
}

export interface NormalizedEmail {
  value: string;
  normalized: string;
  valid: boolean;
  reason?: string;
}

/**
 * A mapped source row after value normalization (but before validation).
 * Every field is optional because source files are sparse.
 */
export interface NormalizedRow {
  values: CanonicalValues;
  email: NormalizedEmail | null;
  urls: Partial<Record<UrlField, NormalizedUrl>>;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  authorName: string | null;
  bookTitle: string | null;
  bookSubtitle: string | null;
  bookQuickKey: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
  genre: string | null;
  description: string | null;
  publisher: string | null;
  isbn: string | null;
  bookFormat: string | null;
  language: string | null;
  publicationDate: string | null;
  organization: string | null;
  role: string | null;
  phone: string | null;
  notes: string | null;
  /** Fingerprint of every normalized value - detects duplicate source rows. */
  sourceFingerprint: string;
  /** `<normalized email>|<book quick key>` - detects duplicate relationships. */
  identityKey: string | null;
}
