import ExcelJS from "exceljs";

import { ParseError, normalizeHeaders, type ParseOptions, type ParsedTable } from "./types";

/**
 * XLSX parsing (ExcelJS).
 *
 * ExcelJS is used instead of the unmaintained `xlsx` package so that parsing
 * untrusted uploads does not depend on known-vulnerable code. The workbook is
 * parsed in memory; the operator can choose a worksheet when the file contains
 * more than one.
 */

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) {
    const isMidnightUtc =
      value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0;
    return isMidnightUtc ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("hyperlink" in value && typeof value.hyperlink === "string") return value.hyperlink;
    if ("result" in value) {
      const result = (value as { result?: unknown }).result;
      if (result === null || result === undefined) return "";
      if (result instanceof Date) return result.toISOString().slice(0, 10);
      return String(result);
    }
    if ("error" in value) return "";
  }
  return "";
}

/** Worksheet names are listed before parsing so the UI can offer a picker. */
export async function listXlsxSheets(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ParseError("MALFORMED", "The workbook could not be read. Is the file a valid .xlsx?");
  }
  return workbook.worksheets.map((sheet) => sheet.name);
}

export async function parseXlsx(buffer: Buffer, options: ParseOptions): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ParseError("MALFORMED", "The workbook could not be read. Is the file a valid .xlsx?");
  }

  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  if (sheetNames.length === 0) {
    throw new ParseError("NO_WORKSHEET", "The workbook does not contain any worksheets.");
  }

  const requested = options.sheetName?.trim();
  const worksheet = requested
    ? workbook.worksheets.find((sheet) => sheet.name === requested)
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new ParseError(
      "SHEET_NOT_FOUND",
      `Worksheet "${requested}" was not found. Available worksheets: ${sheetNames.join(", ")}.`,
    );
  }

  const columnCount = Math.max(worksheet.columnCount, 1);
  const matrix: string[][] = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      cells.push(cellToText(row.getCell(column).value));
    }
    matrix.push(cells);
  });

  if (matrix.length === 0) {
    throw new ParseError("EMPTY_FILE", `Worksheet "${worksheet.name}" does not contain any rows.`);
  }

  const headerIndex = matrix.findIndex((row) => row.some((cell) => cell.trim().length > 0));
  if (headerIndex < 0) {
    throw new ParseError("NO_HEADER_ROW", "Could not find a header row in the worksheet.");
  }

  const headers = normalizeHeaders(matrix[headerIndex] ?? []);
  const dataRows = matrix.slice(headerIndex + 1);

  const truncated = dataRows.length > options.maxRows;
  const limited = truncated ? dataRows.slice(0, options.maxRows) : dataRows;

  const rows = limited.map((row) => {
    const record: Record<string, string | null> = {};
    headers.forEach((header, index) => {
      const value = (row[index] ?? "").trim();
      record[header] = value.length === 0 ? null : value;
    });
    return record;
  });

  return {
    headers,
    rows,
    sheetNames,
    sheetName: worksheet.name,
    truncated,
    sourceRowCount: dataRows.length,
  };
}
