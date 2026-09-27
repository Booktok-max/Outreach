/** Result of parsing an uploaded CSV / XLSX file into a header + row model. */
export interface ParsedTable {
  /** Unique, trimmed source headers (order preserved). */
  headers: string[];
  /** Rows keyed by header. Blank cells are `null`. */
  rows: Array<Record<string, string | null>>;
  /** Worksheet names (XLSX only). */
  sheetNames?: string[];
  /** Worksheet that was parsed (XLSX only). */
  sheetName?: string;
  /** True when the file contained more rows than the configured limit. */
  truncated: boolean;
  /** Rows present in the source file before the limit was applied. */
  sourceRowCount: number;
}

export interface ParseOptions {
  /** Maximum number of data rows to read. */
  maxRows: number;
  /** Worksheet to read (XLSX). Defaults to the first worksheet. */
  sheetName?: string;
}

export type ParseErrorCode =
  | "EMPTY_FILE"
  | "NO_HEADER_ROW"
  | "SHEET_NOT_FOUND"
  | "NO_WORKSHEET"
  | "UNSUPPORTED_FILE"
  | "MALFORMED";

export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.name = "ParseError";
    this.code = code;
  }
}

/** Makes header names unique and non-empty while preserving the source text. */
export function normalizeHeaders(rawHeaders: Array<string | null | undefined>): string[] {
  const seen = new Map<string, number>();
  const headers: string[] = [];

  rawHeaders.forEach((header, index) => {
    const trimmed = (header ?? "").replace(/\uFEFF/g, "").trim();
    const base = trimmed.length > 0 ? trimmed : `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headers.push(count === 0 ? base : `${base} (${count + 1})`);
  });

  return headers;
}
