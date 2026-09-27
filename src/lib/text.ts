/**
 * Generic text normalization helpers shared by the parser, mapping engine,
 * validation, de-duplication and export layers.
 *
 * These functions are intentionally dependency-free and pure so that they can be
 * unit tested without a database.
 */

const ZERO_WIDTH = /[\u200B-\u200C\u200E-\u200F\u2060\uFEFF]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TAG_LIKE = /<\/?[a-zA-Z][^<>]{0,400}>/g;

/**
 * Removes BOM/zero-width characters and control characters, trims the value and
 * collapses horizontal whitespace. Newlines are preserved (single blank lines)
 * because book descriptions legitimately contain paragraphs.
 */
export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(ZERO_WIDTH, "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  const trimmed = cleaned.trim();
  return trimmed.length === 0 ? null : trimmed;
}


/** Returns a single-line version of a value (newlines collapsed to spaces). */
export function cleanSingleLine(value: unknown): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return cleaned.replace(/\s*\n\s*/g, " ").trim() || null;
}

/**
 * Matching key used for aliases, de-duplication and comparisons:
 * Unicode NFKC, diacritics removed, lowercased, punctuation dropped and
 * whitespace collapsed. `"  José's  Café!! "` -> `"jose s cafe"`.
 */
export function normalizeKey(value: unknown): string {
  const cleaned = cleanText(value);
  if (!cleaned) return "";

  return cleaned
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact form of {@link normalizeKey} with all whitespace removed. */
export function compactKey(value: unknown): string {
  return normalizeKey(value).replace(/\s+/g, "");
}

/** Alphanumeric-ish key for titles (keeps digits, drops punctuation). */
export function normalizeTitleKey(value: unknown): string {
  return normalizeKey(value);
}

/** A short, human readable hash-free signature for logging and audit rows. */
export function shortSignature(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .filter((part) => part.length > 0)
    .join(" | ");
}

/** Strips HTML-ish tags that occasionally arrive inside description columns. */
export function stripTags(value: string): string {
  return value.replace(TAG_LIKE, " ").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Spreadsheet formula-injection payloads start with one of these characters
 * (or with whitespace followed by one). Used to protect every generated CSV and
 * XLSX export.
 */
export function isFormulaInjectionRisk(value: string): boolean {
  return /^[\s]*[=+\-@\t\r]/.test(value) || /^[\s]*[=+\-@]/.test(value);
}

/** Prefixes risky values with an apostrophe so spreadsheets treat them as text. */
export function neutralizeFormulaValue(value: string): string {
  return isFormulaInjectionRisk(value) ? `'${value}` : value;
}

/** Safe URL check for rendering user supplied links in the admin UI. */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  return isSafeHttpUrl(value) ? (value as string) : null;
}
