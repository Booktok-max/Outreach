import { cleanSingleLine, cleanText, normalizeKey, normalizeTitleKey } from "@/lib/text";

import type { NormalizedEmail, NormalizedUrl } from "./types";

/**
 * Primitive value normalizers used by the validation, de-duplication and export
 * layers. All functions are pure and side-effect free.
 */

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Practical email syntax check: no whitespace, single `@`, dotted domain with
 * an alphabetic TLD of at least two characters, no leading/trailing dot in the
 * local part and no consecutive dots. Deliberately not RFC 5322 complete -
 * deliverability is what matters here, and the operator sees the reason.
 */
const EMAIL_REGEX =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const EMAIL_MAX_LENGTH = 254;
const EMAIL_LOCAL_MAX_LENGTH = 64;

/** Removes wrapping characters that regularly arrive via copy/paste. */
export function unwrapEmail(value: string): string {
  let candidate = value.trim();
  candidate = candidate.replace(/^mailto:/i, "");
  candidate = candidate.replace(/^[<("']+/, "").replace(/[>)"'.,;]+$/, "");
  return candidate.trim();
}

export function normalizeEmail(raw: unknown): NormalizedEmail | null {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return null;

  const unwrapped = unwrapEmail(cleaned);
  if (unwrapped.length === 0) return null;

  const normalized = unwrapped.toLowerCase();

  if (unwrapped.length > EMAIL_MAX_LENGTH) {
    return {
      value: unwrapped,
      normalized,
      valid: false,
      reason: `longer than ${EMAIL_MAX_LENGTH} characters`,
    };
  }

  const atIndex = unwrapped.lastIndexOf("@");
  if (atIndex > 0 && atIndex < unwrapped.length - 1) {
    const localPart = unwrapped.slice(0, atIndex);
    if (localPart.length > EMAIL_LOCAL_MAX_LENGTH) {
      return {
        value: unwrapped,
        normalized,
        valid: false,
        reason: `local part longer than ${EMAIL_LOCAL_MAX_LENGTH} characters`,
      };
    }
  }

  if (!EMAIL_REGEX.test(unwrapped)) {
    return { value: unwrapped, normalized, valid: false, reason: "not a valid email address" };
  }

  return { value: unwrapped, normalized, valid: true };
}

/** Key used for email de-duplication (trimmed + lowercased). */
export function normalizeEmailKey(raw: unknown): string {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return "";
  return unwrapEmail(cleaned).toLowerCase();
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

const BARE_DOMAIN = /^(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}(?:[/?#].*)?$/;

function looksLikeBareDomain(value: string): boolean {
  if (/\s/.test(value)) return false;
  return BARE_DOMAIN.test(value);
}

export function normalizeUrl(raw: unknown): NormalizedUrl | null {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return null;

  let candidate = cleaned
    .replace(/^[<("']+/, "")
    .replace(/[>)"'.,;]+$/, "")
    .trim();
  if (candidate.length === 0) return null;

  let prefixed = false;
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(candidate)) {
    if (candidate.startsWith("//")) {
      candidate = `https:${candidate}`;
      prefixed = true;
    } else if (looksLikeBareDomain(candidate)) {
      candidate = `https://${candidate}`;
      prefixed = true;
    }
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { value: cleaned, normalized: "", valid: false, reason: "not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      value: cleaned,
      normalized: "",
      valid: false,
      reason: `unsupported protocol "${url.protocol.replace(":", "")}"`,
    };
  }

  if (!url.hostname.includes(".")) {
    return { value: cleaned, normalized: "", valid: false, reason: "host name is not a domain" };
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.port = "";
  if (url.pathname === "/") url.pathname = "";

  return {
    value: cleaned,
    normalized: url.toString(),
    valid: true,
    ...(prefixed ? { reason: "missing scheme - https:// was added" } : {}),
  };
}

/** Converts social handles (`@author`) into profile URLs where that is obvious. */
export function normalizeSocialHandle(
  raw: string,
  platform: "twitter" | "instagram" | "tiktok" | "facebook",
): string {
  const handle = raw.trim().replace(/^@/, "");
  const base: Record<typeof platform, string> = {
    twitter: "https://x.com/",
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/@",
    facebook: "https://facebook.com/",
  };
  return `${base[platform]}${handle}`;
}

export const SOCIAL_HANDLE_FIELDS = {
  twitterUrl: "twitter",
  instagramUrl: "instagram",
  tiktokUrl: "tiktok",
  facebookUrl: "facebook",
} as const;

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v", "phd", "md", "esq"]);
const NAME_PREFIXES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "sir", "dame"]);

export interface ParsedName {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Splits a display name into first/last name.
 * Supports `"Last, First"`, multi-word surnames, prefixes and suffixes.
 */
export function parseFullName(raw: unknown): ParsedName {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return { fullName: null, firstName: null, lastName: null };

  const fullName = cleaned.replace(/\s+/g, " ");

  // `"Smith, Jane"` -> `"Jane Smith"`
  if (fullName.includes(",")) {
    const [lastPart, ...restParts] = fullName.split(",").map((part) => part.trim());
    const rest = restParts.join(" ").trim();
    if (lastPart && rest) {
      return { fullName: `${rest} ${lastPart}`, firstName: rest, lastName: lastPart };
    }
  }

  const tokens = fullName.split(" ").filter(Boolean);
  const trimmed = tokens.filter((token, index) => {
    const lower = token.toLowerCase().replace(/\.$/, "");
    if (index === 0 && NAME_PREFIXES.has(lower)) return false;
    if (index === tokens.length - 1 && NAME_SUFFIXES.has(lower)) return false;
    return true;
  });

  const effective = trimmed.length > 0 ? trimmed : tokens;

  if (effective.length === 1) {
    return { fullName, firstName: effective[0] ?? null, lastName: null };
  }

  return {
    fullName,
    firstName: effective[0] ?? null,
    lastName: effective[effective.length - 1] ?? null,
  };
}

export function buildFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const parts = [firstName, lastName].map((part) => cleanSingleLine(part)).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Book identity
// ---------------------------------------------------------------------------

/**
 * De-duplication key for a book: normalized title + normalized lead author.
 * Two rows describing the same book (author + publicist) resolve to one Book
 * row, while a title collision across different authors stays distinct.
 */
export function buildBookQuickKey(
  title: string | null | undefined,
  authorName: string | null | undefined,
): string | null {
  const normalizedTitle = normalizeTitleKey(title);
  if (!normalizedTitle) return null;
  return `${normalizedTitle}||${normalizeKey(authorName)}`;
}

/** `"Book 2"`, `"#2"`, `"2 of 5"` -> 2 */
export function normalizeSeriesPosition(raw: unknown): number | null {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return null;
  const match = cleaned.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 9999) return null;
  return parsed;
}

export function normalizeIsbn(raw: unknown): string | null {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return null;
  const digits = cleaned.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (digits.length !== 10 && digits.length !== 13) return null;
  return digits;
}

export function normalizePhone(raw: unknown): string | null {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return null;
  const trimmed = cleaned.replace(/[^\d+().\- ]/g, "").trim();
  if (trimmed.replace(/\D/g, "").length < 6) return null;
  return trimmed;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Parses the many shapes a publication date arrives in and returns an ISO date
 * (`YYYY-MM-DD`). Year-only values anchor to January 1st and month-only values
 * to the 1st; the original string stays in the import row for audit.
 */
export function normalizePublicationDate(raw: unknown): string | null {
  const cleaned = cleanSingleLine(raw);
  if (!cleaned) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleaned);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const yearMonth = /^(\d{4})[-/](\d{1,2})$/.exec(cleaned);
  if (yearMonth) {
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) {
      return `${yearMonth[1]}-${String(month).padStart(2, "0")}-01`;
    }
  }

  const yearOnly = /^(\d{4})$/.exec(cleaned);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (year >= 1400 && year <= 2200) return `${yearOnly[1]}-01-01`;
  }

  const monthYear = /^(\d{1,2})[-/](\d{4})$/.exec(cleaned);
  if (monthYear) {
    const month = Number(monthYear[1]);
    if (month >= 1 && month <= 12) {
      return `${monthYear[2]}-${String(month).padStart(2, "0")}-01`;
    }
  }

  const numeric = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(cleaned);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const monthName = cleaned.toLowerCase().match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthName) {
    const monthIndex = MONTHS.indexOf(monthName[1] ?? "");
    if (monthIndex >= 0) {
      return `${monthName[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(
        Number(monthName[2]),
      ).padStart(2, "0")}`;
    }
  }

  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return null;
}

/** Lowercased search haystack used by the lead browser. */
export function buildSearchText(parts: Array<string | null | undefined>): string | null {
  const joined = parts
    .map((part) => (part ? part.toLowerCase().trim() : ""))
    .filter((part) => part.length > 0)
    .join(" ");
  return joined.length > 0 ? joined : null;
}

/** Canonical description text (keeps paragraphs, drops tags/control chars). */
export function normalizeDescription(raw: unknown): string | null {
  return cleanText(raw);
}


