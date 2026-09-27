import { parseCsv } from "./csv";
import { ParseError, type ParseOptions, type ParsedTable } from "./types";
import { parseXlsx } from "./xlsx";

export { ParseError } from "./types";
export type { ParseOptions, ParsedTable } from "./types";
export { parseCsv } from "./csv";
export { listXlsxSheets, parseXlsx } from "./xlsx";

export type SupportedFileType = "csv" | "xlsx";

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const XLSX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/octet-stream",
]);
const CSV_MIME = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "text/x-csv",
  "",
]);

export interface DetectedFile {
  fileType: SupportedFileType;
  extension: string;
}

/**
 * Server side file type validation: the extension must match the browser
 * supplied MIME type *and* the file signature. `.xls` (legacy binary) is
 * rejected explicitly rather than being silently mis-parsed.
 */
export function detectFileType(filename: string, mimeType: string | null, buffer: Buffer): DetectedFile {
  const extension = (filename.split(".").pop() ?? "").toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();

  if (extension === "xls" || mime === "application/vnd.ms-excel") {
    throw new ParseError(
      "UNSUPPORTED_FILE",
      "Legacy .xls files are not supported. Save the file as .xlsx or .csv and upload it again.",
    );
  }

  if (extension === "csv") {
    if (!CSV_MIME.has(mime) && !mime.startsWith("text/")) {
      throw new ParseError(
        "UNSUPPORTED_FILE",
        `Unexpected content type "${mime || "unknown"}" for a .csv upload.`,
      );
    }
    // A text file should not contain NUL bytes; treat those as a binary payload.
    if (buffer.includes(0x00)) {
      throw new ParseError("MALFORMED", "The .csv file appears to contain binary data.");
    }
    return { fileType: "csv", extension };
  }

  if (extension === "xlsx") {
    const looksLikeZip = XLSX_MAGIC.every((byte, index) => buffer[index] === byte);
    if (!looksLikeZip) {
      throw new ParseError("MALFORMED", "The .xlsx file is not a valid ZIP container.");
    }
    if (mime.length > 0 && !XLSX_MIME.has(mime) && !mime.startsWith("application/vnd.")) {
      throw new ParseError(
        "UNSUPPORTED_FILE",
        `Unexpected content type "${mime}" for an .xlsx upload.`,
      );
    }
    return { fileType: "xlsx", extension };
  }

  throw new ParseError(
    "UNSUPPORTED_FILE",
    `Unsupported file type ".${extension}". Upload a .csv or .xlsx file.`,
  );
}

/** Parses an uploaded file once its type has been validated. */
export async function parseUpload(
  buffer: Buffer,
  fileType: SupportedFileType,
  options: ParseOptions,
): Promise<ParsedTable> {
  if (fileType === "csv") {
    return parseCsv(buffer.toString("utf8"), options);
  }
  return parseXlsx(buffer, options);
}
