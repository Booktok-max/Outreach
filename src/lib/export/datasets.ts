/**
 * Export record shapes and the pure builders behind the GMass export and the
 * general canonical export. Keeping them pure means the export rules (filters,
 * headers, escaping) are unit testable without a database.
 */

export type OutreachStateValue = "PENDING" | "APPROVED" | "REJECTED" | "SUPPRESSED";

export type EmailStatusValue = "UNKNOWN" | "VALID" | "INVALID" | null;

/** One contact ready to be turned into an export row. */
export interface ContactExportRecord {
  personId: string;
  email: string | null;
  emailStatus: EmailStatusValue;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  authorName: string | null;
  penName: string | null;
  organization: string | null;
  role: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  tiktokUrl: string | null;
  goodreadsUrl: string | null;
  outreachStatus: OutreachStateValue;
  suppressionReason: string | null;

  bookId: string | null;
  bookTitle: string | null;
  bookSubtitle: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
  genre: string | null;
  description: string | null;
  bookUrl: string | null;
  amazonUrl: string | null;
  isbn: string | null;
  publisher: string | null;
  publicationDate: string | null;
  bookFormat: string | null;
  language: string | null;
  bookRole: string | null;

  sourceFile: string | null;
  sourceRow: number | null;
  importedAt: string | null;
}

// ---------------------------------------------------------------------------
// GMass export
// ---------------------------------------------------------------------------

/** Headers required by the V1 GMass export, in order. */
export const GMASS_REQUIRED_HEADERS = [
  "Email",
  "FirstName",
  "LastName",
  "AuthorName",
  "BookTitle",
  "SeriesName",
  "Genre",
  "BookURL",
  "AmazonURL",
] as const;

/** Extra canonical columns the operator can explicitly opt into. */
export const GMASS_OPTIONAL_COLUMNS = [
  "Organization",
  "Role",
  "BookSubtitle",
  "Website",
  "BookFormat",
  "Language",
] as const;

export type GmassOptionalColumn = (typeof GMASS_OPTIONAL_COLUMNS)[number];

export interface GmassExportOptions {
  /** Optional columns the operator ticked in the export screen. */
  optionalColumns?: GmassOptionalColumn[];
}

export interface ExportDataset {
  headers: string[];
  rows: Array<Array<string | number | null>>;
}

function optionalValue(record: ContactExportRecord, column: GmassOptionalColumn): string | null {
  switch (column) {
    case "Organization":
      return record.organization;
    case "Role":
      return record.role;
    case "BookSubtitle":
      return record.bookSubtitle;
    case "Website":
      return record.websiteUrl;
    case "BookFormat":
      return record.bookFormat;
    case "Language":
      return record.language;
    default:
      return null;
  }
}

/**
 * Builds the GMass dataset. Internal ids and raw import metadata are never
 * included - only the campaign facing columns.
 */
export function buildGmassDataset(
  records: ContactExportRecord[],
  options: GmassExportOptions = {},
): ExportDataset {
  const optional = options.optionalColumns ?? [];
  const headers = [...GMASS_REQUIRED_HEADERS, ...optional];

  const rows = records.map((record) => {
    const row: Array<string | number | null> = [
      record.email,
      record.firstName,
      record.lastName,
      record.authorName ?? record.fullName,
      record.bookTitle,
      record.seriesName,
      record.genre,
      record.bookUrl,
      record.amazonUrl,
    ];

    for (const column of optional) {
      row.push(optionalValue(record, column));
    }

    return row;
  });

  return { headers, rows };
}

export interface ExportSummary {
  /** Contacts that will actually be written to the file. */
  ready: number;
  /** Contacts of the reviewed pool. */
  reviewed: number;
  valid: number;
  invalidEmail: number;
  suppressed: number;
  rejected: number;
  missingEmail: number;
}

/** The default export filter: APPROVED + VALID email + NOT SUPPRESSED. */
export function isExportable(record: ContactExportRecord): boolean {
  return (
    record.outreachStatus === "APPROVED" &&
    record.emailStatus === "VALID" &&
    Boolean(record.email && record.email.trim().length > 0)
  );
}

export function selectExportableRecords(records: ContactExportRecord[]): ContactExportRecord[] {
  return records.filter(isExportable);
}

/**
 * Counts for the pre-export confirmation panel. `ready` is exactly what the
 * default GMass filter ships; the other numbers explain what was left out.
 */
export function summarizeExport(records: ContactExportRecord[]): ExportSummary {
  let ready = 0;
  let valid = 0;
  let invalidEmail = 0;
  let suppressed = 0;
  let rejected = 0;
  let missingEmail = 0;

  for (const record of records) {
    const hasEmail = Boolean(record.email && record.email.trim().length > 0);

    if (!hasEmail) missingEmail += 1;
    if (record.emailStatus === "VALID") valid += 1;
    if (record.emailStatus === "INVALID") invalidEmail += 1;
    if (record.outreachStatus === "SUPPRESSED") suppressed += 1;
    if (record.outreachStatus === "REJECTED") rejected += 1;
    if (isExportable(record)) ready += 1;
  }

  return {
    ready,
    reviewed: records.length,
    valid,
    invalidEmail,
    suppressed,
    rejected,
    missingEmail,
  };
}

// ---------------------------------------------------------------------------
// General canonical export
// ---------------------------------------------------------------------------

export interface GeneralExportOptions {
  /** Include internal database ids. Off by default (PRD requirement). */
  includeIds?: boolean;
  /** Include raw import provenance (source file / row / date). On by default. */
  includeProvenance?: boolean;
}

export function buildGeneralDataset(
  records: ContactExportRecord[],
  options: GeneralExportOptions = {},
): ExportDataset {
  const includeIds = options.includeIds ?? false;
  const includeProvenance = options.includeProvenance ?? true;

  const headers: string[] = [];
  if (includeIds) headers.push("PersonId", "BookId");

  headers.push(
    "Email",
    "EmailStatus",
    "FirstName",
    "LastName",
    "FullName",
    "AuthorName",
    "PenName",
    "Organization",
    "Role",
    "Website",
    "Twitter",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "TikTok",
    "Goodreads",
    "BookTitle",
    "BookSubtitle",
    "SeriesName",
    "SeriesPosition",
    "Genre",
    "Description",
    "BookURL",
    "AmazonURL",
    "ISBN",
    "Publisher",
    "PublicationDate",
    "BookFormat",
    "Language",
    "BookRole",
    "OutreachStatus",
    "SuppressionReason",
  );

  if (includeProvenance) headers.push("SourceFile", "SourceRow", "ImportedAt");

  const rows = records.map((record) => {
    const row: Array<string | number | null> = [];
    if (includeIds) row.push(record.personId, record.bookId);

    row.push(
      record.email,
      record.emailStatus,
      record.firstName,
      record.lastName,
      record.fullName,
      record.authorName,
      record.penName,
      record.organization,
      record.role,
      record.websiteUrl,
      record.twitterUrl,
      record.instagramUrl,
      record.facebookUrl,
      record.linkedinUrl,
      record.tiktokUrl,
      record.goodreadsUrl,
      record.bookTitle,
      record.bookSubtitle,
      record.seriesName,
      record.seriesPosition,
      record.genre,
      record.description,
      record.bookUrl,
      record.amazonUrl,
      record.isbn,
      record.publisher,
      record.publicationDate,
      record.bookFormat,
      record.language,
      record.bookRole,
      record.outreachStatus,
      record.suppressionReason,
    );

    if (includeProvenance) {
      row.push(record.sourceFile, record.sourceRow, record.importedAt);
    }

    return row;
  });

  return { headers, rows };
}

