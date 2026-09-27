import { neutralizeFormulaValue } from "@/lib/text";

/**
 * RFC 4180 CSV writer with spreadsheet formula-injection protection.
 *
 * Any value that starts with `=`, `+`, `-`, `@`, tab or carriage return (or
 * whitespace followed by one of those) is prefixed with an apostrophe so that
 * Excel / Google Sheets / LibreOffice treat it as text instead of a formula.
 */
export function escapeCsvValue(value: unknown, options?: { protect?: boolean }): string {
  const protect = options?.protect ?? true;

  if (value === null || value === undefined) return "";

  let text = String(value);
  if (text.length === 0) return "";

  if (protect) text = neutralizeFormulaValue(text);

  const needsQuotes = /[",\r\n]/.test(text);
  if (!needsQuotes) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

export interface CsvBuildOptions {
  /** Prefix the output with a UTF-8 BOM (helps Excel detect the encoding). */
  withBom?: boolean;
  /** Disable formula-injection protection (never used for user data). */
  protectFormulas?: boolean;
  /** Line terminator; RFC 4180 uses CRLF. */
  newline?: string;
}

export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  options: CsvBuildOptions = {},
): string {
  const newline = options.newline ?? "\r\n";
  const protect = options.protectFormulas ?? true;

  const lines: string[] = [];
  lines.push(headers.map((header) => escapeCsvValue(header, { protect })).join(","));

  for (const row of rows) {
    lines.push(row.map((value) => escapeCsvValue(value, { protect })).join(","));
  }

  const body = lines.join(newline) + newline;
  return options.withBom ? `\uFEFF${body}` : body;
}
