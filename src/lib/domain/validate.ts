import type { NormalizedRow, ValidationIssue } from "./types";

export interface RowValidationResult {
  status: "valid" | "invalid";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Server side validation of a mapped + normalized row.
 *
 * Rules (V1)
 * ----------
 * * Email is the identifying field for outreach: missing or syntactically
 *   invalid email makes the row INVALID (it is never dropped - the operator can
 *   still see, fix and export it).
 * * A row must carry meaningful person or book information (name and/or title).
 * * URLs must be structurally valid http(s) URLs. A value that was missing its
 *   scheme (`author.com`) is auto-prefixed and reported as a warning.
 * * Dates, ISBNs and series numbers that cannot be parsed are warnings: they do
 *   not block outreach, but the operator is told.
 */
export function validateNormalizedRow(row: NormalizedRow): RowValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- email ---------------------------------------------------------------
  if (!row.email || row.email.value.trim().length === 0) {
    errors.push({
      field: "email",
      code: "EMAIL_MISSING",
      message: "No email address in this row - the record cannot be contacted.",
    });
  } else if (!row.email.valid) {
    errors.push({
      field: "email",
      code: "EMAIL_INVALID",
      message: `"${row.email.value}" is not a valid email address${
        row.email.reason ? ` (${row.email.reason})` : ""
      }.`,
    });
  }

  // --- identity ------------------------------------------------------------
  const hasPerson = Boolean(row.fullName ?? row.authorName ?? row.firstName ?? row.lastName);
  const hasBook = Boolean(row.bookTitle);

  if (!hasPerson && !hasBook) {
    errors.push({
      field: "row",
      code: "IDENTITY_MISSING",
      message:
        "No meaningful person or book information: map a name/author column and/or a book title column.",
    });
  }

  if (!hasPerson && hasBook) {
    warnings.push({
      field: "row",
      code: "PERSON_MISSING",
      message: "Row has book information but no person name.",
    });
  }

  if (hasPerson && !hasBook) {
    warnings.push({
      field: "bookTitle",
      code: "BOOK_TITLE_MISSING",
      message: "Row has no book title - the export will have an empty BookTitle column.",
    });
  }

  // --- URLs ---------------------------------------------------------------
  for (const [field, url] of Object.entries(row.urls)) {
    if (!url) continue;
    if (!url.valid) {
      errors.push({
        field: field as ValidationIssue["field"],
        code: "URL_INVALID",
        message: `"${url.value}" is not a valid URL${url.reason ? ` (${url.reason})` : ""}.`,
      });
    } else if (url.reason) {
      warnings.push({
        field: field as ValidationIssue["field"],
        code: "URL_NORMALIZED",
        message: `"${url.value}" -> "${url.normalized}" (${url.reason}).`,
      });
    }
  }

  // --- soft warnings ------------------------------------------------------
  const rawSeriesPosition = row.values.seriesPosition;
  if (rawSeriesPosition && row.seriesPosition === null) {
    warnings.push({
      field: "seriesPosition",
      code: "SERIES_POSITION_UNPARSED",
      message: `Series number "${rawSeriesPosition}" could not be read as a number.`,
    });
  }

  const rawPublicationDate = row.values.publicationDate;
  if (rawPublicationDate && row.publicationDate === null) {
    warnings.push({
      field: "publicationDate",
      code: "PUBLICATION_DATE_UNPARSED",
      message: `Publication date "${rawPublicationDate}" could not be parsed.`,
    });
  }

  const rawIsbn = row.values.isbn;
  if (rawIsbn && row.isbn === null) {
    warnings.push({
      field: "isbn",
      code: "ISBN_UNRECOGNIZED",
      message: `ISBN "${rawIsbn}" is not a valid 10 or 13 digit ISBN.`,
    });
  }

  return {
    status: errors.length > 0 ? "invalid" : "valid",
    errors,
    warnings,
  };
}
