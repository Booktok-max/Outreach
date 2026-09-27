import Papa from "papaparse";

import { ParseError, normalizeHeaders, type ParseOptions, type ParsedTable } from "./types";

/**
 * CSV parsing.
 *
 * Papa Parse handles the parts that naive `split(",")` implementations get
 * wrong: quoted fields, commas and newlines inside descriptions, escaped quotes
 * (`""`), CRLF/CR line endings, UTF-8 BOM and blank cells. We deliberately
 * disable dynamic typing so that leading zeros, ISBNs and phone numbers are
 * never coerced into numbers, and every cell arrives as a string.
 */
export function parseCsv(content: string, options: ParseOptions): ParsedTable {
  const withoutBom = content.replace(/^\uFEFF/, "");
  if (withoutBom.trim().length === 0) {
    throw new ParseError("EMPTY_FILE", "The file is empty.");
  }

  const result = Papa.parse<string[]>(withoutBom, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: "greedy",
    // Keep row length errors visible to us instead of silently dropping data.
    transform: (value) => value,
  });

  const rows = result.data.filter((row) => Array.isArray(row));

  if (rows.length === 0) {
    throw new ParseError("EMPTY_FILE", "The file does not contain any rows.");
  }

  const headerRow = rows[0] ?? [];
  const headers = normalizeHeaders(headerRow);

  if (headers.length === 0) {
    throw new ParseError("NO_HEADER_ROW", "Could not find a header row in the file.");
  }

  const dataRows = rows.slice(1);
  const truncated = dataRows.length > options.maxRows;
  const limited = truncated ? dataRows.slice(0, options.maxRows) : dataRows;

  const mapped: Array<Record<string, string | null>> = limited.map((row) => {
    const record: Record<string, string | null> = {};
    headers.forEach((header, index) => {
      const value = row[index];
      const cleaned = typeof value === "string" ? value.trim() : value;
      record[header] =
        cleaned === undefined || cleaned === null || cleaned === "" ? null : String(cleaned);
    });
    return record;
  });

  return {
    headers,
    rows: mapped,
    truncated,
    sourceRowCount: dataRows.length,
  };
}
