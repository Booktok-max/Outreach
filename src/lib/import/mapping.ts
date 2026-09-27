import { cleanText, compactKey, normalizeKey } from "@/lib/text";

import type { CanonicalField } from "./fields";
import {
  CANONICAL_FIELD_DEFINITIONS,
  FIELD_BY_KEY,
  IDENTIFYING_FIELDS,
  areSiblingFields,
  getFieldLabel,
  isCanonicalField,
} from "./fields";

/**
 * Column detection / mapping engine.
 *
 * `detectColumn` scores every canonical field against a source header and
 * returns the best candidate together with a confidence level. Scoring is
 * layered so that exact aliases always win, and genuinely ambiguous headers
 * (e.g. a column literally called `title`, which could be a book title or a job
 * title) are surfaced to the operator instead of being guessed.
 */

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export interface FieldCandidate {
  field: CanonicalField;
  confidence: number;
  reason: string;
}

export interface ColumnDetection {
  sourceHeader: string;
  normalizedHeader: string;
  suggestion: CanonicalField | null;
  confidence: number;
  level: ConfidenceLevel;
  ambiguous: boolean;
  /** More than one source column suggests the same field. */
  conflict: boolean;
  requiresConfirmation: boolean;
  alternatives: FieldCandidate[];
  reason: string;
}

/** `{ [sourceHeader]: CanonicalField | null }` - null means "ignore this column". */
export type ColumnMapping = Record<string, CanonicalField | null>;

export type CanonicalValues = Partial<Record<CanonicalField, string>>;

export const HIGH_CONFIDENCE = 0.9;
export const MEDIUM_CONFIDENCE = 0.7;
export const LOW_CONFIDENCE = 0.4;
const AMBIGUITY_MARGIN = 0.05;

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE) return "high";
  if (confidence >= MEDIUM_CONFIDENCE) return "medium";
  if (confidence >= LOW_CONFIDENCE) return "low";
  return "none";
}

/** Drops a trailing plural `s` so `authors` matches `author`. */
function stemToken(token: string): string {
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(" ").filter((token) => token.length > 0).map(stemToken);
}

function overlapCount(a: string[], b: string[]): number {
  const remaining = [...b];
  let overlap = 0;
  for (const token of a) {
    const index = remaining.indexOf(token);
    if (index >= 0) {
      overlap += 1;
      remaining.splice(index, 1);
    }
  }
  return overlap;
}

/** Confidence of a single alias versus a source header. */
function aliasScore(
  headerCompact: string,
  headerTokens: string[],
  alias: string,
): { score: number; reason: string } {
  const aliasCompact = compactKey(alias);
  if (!aliasCompact) return { score: 0, reason: "" };

  if (headerCompact === aliasCompact) {
    return { score: 1, reason: `exact alias match ("${alias}")` };
  }

  const aliasTokens = tokenize(normalizeKey(alias));
  if (aliasTokens.length === 0) return { score: 0, reason: "" };

  const overlap = overlapCount(headerTokens, aliasTokens);
  if (overlap === 0) return { score: 0, reason: "" };

  const extra = headerTokens.length - overlap;
  const missing = aliasTokens.length - overlap;

  if (extra === 0 && missing === 0) {
    return { score: 0.95, reason: `word-order / plural match with "${alias}"` };
  }
  if (missing === 0) {
    return {
      score: Math.max(0.6, 0.9 - 0.03 * extra),
      reason: `contains alias "${alias}" plus ${extra} extra word(s)`,
    };
  }
  if (extra === 0) {
    return {
      score: Math.max(0.55, 0.88 - 0.06 * missing),
      reason: `partial match to alias "${alias}"`,
    };
  }

  const dice = (2 * overlap) / (headerTokens.length + aliasTokens.length);
  return {
    score: 0.45 + 0.45 * dice,
    reason: `token similarity with alias "${alias}"`,
  };
}

const KEYWORD_SCORE = 0.62;

/** Keyword heuristics: last resort before a column is left unmapped. */
function keywordScore(
  headerCompact: string,
  headerTokens: string[],
  keywords: string[],
): { score: number; reason: string } {
  let best = 0;
  let reason = "";
  for (const keyword of keywords) {
    const keywordCompact = compactKey(keyword);
    if (!keywordCompact) continue;
    const stemmed = stemToken(keywordCompact);
    if (headerTokens.includes(stemmed) || headerTokens.includes(keywordCompact)) {
      if (KEYWORD_SCORE + 0.03 > best) {
        best = KEYWORD_SCORE + 0.03;
        reason = `keyword "${keyword}" present`;
      }
      continue;
    }
    if (headerCompact.includes(keywordCompact)) {
      if (KEYWORD_SCORE - 0.04 > best) {
        best = KEYWORD_SCORE - 0.04;
        reason = `keyword "${keyword}" appears in the header`;
      }
    }
  }
  return { score: best, reason };
}

/** Scores a single canonical field against a source header. */
export function scoreField(header: string, field: CanonicalField): FieldCandidate {
  const normalizedHeader = normalizeKey(header);
  const headerCompact = normalizedHeader.replace(/\s+/g, "");
  const headerTokens = tokenize(normalizedHeader);
  const definition = FIELD_BY_KEY[field];

  let best = 0;
  let reason = "";

  for (const alias of definition.aliases) {
    const { score, reason: aliasReason } = aliasScore(headerCompact, headerTokens, alias);
    if (score > best) {
      best = score;
      reason = aliasReason;
    }
  }

  // The canonical field name itself also acts as an alias (`bookUrl` -> `book url`).
  const fieldNameScore = aliasScore(
    headerCompact,
    headerTokens,
    normalizeKey(field.replace(/([A-Z])/g, " $1")),
  );
  if (fieldNameScore.score > best) {
    best = fieldNameScore.score;
    reason = fieldNameScore.reason;
  }

  if (best < MEDIUM_CONFIDENCE) {
    const keyword = keywordScore(headerCompact, headerTokens, definition.keywords);
    if (keyword.score > best) {
      best = keyword.score;
      reason = keyword.reason;
    }
  }

  return { field, confidence: Number(best.toFixed(4)), reason };
}

/**
 * Detects the canonical field a single source column most likely represents.
 * Ambiguity is reported (never silently resolved) when the two best candidates
 * are within {@link AMBIGUITY_MARGIN} of each other and are not sibling fields.
 */
export function detectColumn(header: string): ColumnDetection {
  const normalizedHeader = normalizeKey(header);

  const candidates = CANONICAL_FIELD_DEFINITIONS.map((definition) =>
    scoreField(header, definition.field),
  )
    .filter((candidate) => candidate.confidence > 0)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return FIELD_BY_KEY[a.field].priority - FIELD_BY_KEY[b.field].priority;
    });

  const best = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;

  if (!best || best.confidence < LOW_CONFIDENCE) {
    return {
      sourceHeader: header,
      normalizedHeader,
      suggestion: null,
      confidence: best ? best.confidence : 0,
      level: "none",
      ambiguous: false,
      conflict: false,
      requiresConfirmation: true,
      alternatives: candidates.slice(0, 3),
      reason: best
        ? `no confident match (best guess "${getFieldLabel(best.field)}" at ${Math.round(
            best.confidence * 100,
          )}%)`
        : "no known alias matched this column",
    };
  }

  const ambiguous =
    runnerUp !== null &&
    runnerUp.confidence >= LOW_CONFIDENCE &&
    best.confidence - runnerUp.confidence <= AMBIGUITY_MARGIN &&
    !areSiblingFields(best.field, runnerUp.field);

  // When a header matches several sibling fields exactly (name / author name),
  // the specific one wins and the mapping is not reported as ambiguous.
  const level = confidenceLevel(best.confidence);

  return {
    sourceHeader: header,
    normalizedHeader,
    suggestion: best.field,
    confidence: best.confidence,
    level,
    ambiguous,
    conflict: false,
    requiresConfirmation: ambiguous || level !== "high",
    alternatives: candidates.slice(0, 3),
    reason: ambiguous
      ? `ambiguous: "${getFieldLabel(best.field)}" and "${getFieldLabel(
          runnerUp.field,
        )}" both match`
      : best.reason,
  };
}

/** Detects all columns of a file and flags collisions between them. */
export function detectColumns(headers: string[]): ColumnDetection[] {
  const detections = headers.map((header) => detectColumn(header));

  const claimed = new Map<CanonicalField, ColumnDetection[]>();
  for (const detection of detections) {
    if (!detection.suggestion) continue;
    const list = claimed.get(detection.suggestion) ?? [];
    list.push(detection);
    claimed.set(detection.suggestion, list);
  }

  for (const [, list] of claimed) {
    if (list.length < 2) continue;
    for (const detection of list) {
      detection.conflict = true;
      detection.requiresConfirmation = true;
    }
  }

  return detections;
}

/** Builds a starter mapping from detections (only unambiguous, confident picks). */
export function suggestMapping(detections: ColumnDetection[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<CanonicalField>();

  for (const detection of detections) {
    if (!detection.suggestion || detection.conflict || detection.ambiguous) {
      mapping[detection.sourceHeader] = null;
      continue;
    }
    if (used.has(detection.suggestion)) {
      mapping[detection.sourceHeader] = null;
      continue;
    }
    used.add(detection.suggestion);
    mapping[detection.sourceHeader] = detection.suggestion;
  }

  return mapping;
}

export interface MappingIssue {
  code: string;
  message: string;
  fields?: CanonicalField[];
  columns?: string[];
}

export interface MappingValidation {
  ok: boolean;
  errors: MappingIssue[];
  warnings: MappingIssue[];
}

/**
 * Validates an operator-confirmed mapping:
 *  * only known canonical fields,
 *  * one source column per canonical field,
 *  * at least one identifying field (email / name / book title),
 *  * a loud warning when no email column is mapped (every row would be invalid).
 */
export function validateMapping(
  mapping: ColumnMapping,
  sourceHeaders?: string[],
): MappingValidation {
  const errors: MappingIssue[] = [];
  const warnings: MappingIssue[] = [];

  const headers = sourceHeaders ?? Object.keys(mapping);
  const targetToColumns = new Map<CanonicalField, string[]>();
  const unknownColumns: string[] = [];

  for (const header of headers) {
    if (!(header in mapping)) {
      warnings.push({
        code: "COLUMN_NOT_MAPPED",
        message: `Column "${header}" has no mapping; it will be ignored.`,
        columns: [header],
      });
      continue;
    }

    const target = mapping[header];
    if (target === null || target === undefined) continue;

    if (!isCanonicalField(target)) {
      errors.push({
        code: "UNKNOWN_FIELD",
        message: `Column "${header}" was mapped to the unknown field "${String(target)}".`,
        columns: [header],
      });
      unknownColumns.push(header);
      continue;
    }

    const list = targetToColumns.get(target) ?? [];
    list.push(header);
    targetToColumns.set(target, list);
  }

  for (const [target, columns] of targetToColumns) {
    if (columns.length > 1) {
      errors.push({
        code: "DUPLICATE_TARGET",
        message: `Columns ${columns
          .map((column) => `"${column}"`)
          .join(", ")} all map to "${getFieldLabel(target)}". Ignore the ones you do not need.`,
        fields: [target],
        columns,
      });
    }
  }

  const mappedFields = new Set(targetToColumns.keys());
  const identifying = IDENTIFYING_FIELDS.filter((field) => mappedFields.has(field));

  if (identifying.length === 0) {
    errors.push({
      code: "NO_IDENTIFYING_FIELD",
      message:
        "Map at least one identifying column (email, author/contact name or book title) before continuing.",
      fields: IDENTIFYING_FIELDS,
    });
  }

  if (!mappedFields.has("email")) {
    warnings.push({
      code: "NO_EMAIL_COLUMN",
      message:
        "No email column is mapped. Every row will be flagged as invalid until an email column is mapped.",
      fields: ["email"],
    });
  }

  if (!mappedFields.has("bookTitle")) {
    warnings.push({
      code: "NO_BOOK_TITLE_COLUMN",
      message: "No book title column is mapped. Exports will have an empty BookTitle column.",
      fields: ["bookTitle"],
    });
  }

  if (unknownColumns.length > 0) {
    errors.push({
      code: "UNKNOWN_COLUMNS",
      message: `${unknownColumns.length} column(s) could not be mapped to a known field.`,
      columns: unknownColumns,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Applies a confirmed mapping to one raw source row.
 * Returns canonical values (cleaned, but not yet validated/normalized).
 */
export function applyMapping(
  rawRow: Record<string, unknown>,
  mapping: ColumnMapping,
): CanonicalValues {
  const values: CanonicalValues = {};

  for (const header of Object.keys(mapping)) {
    const target = mapping[header];
    if (!target || !isCanonicalField(target)) continue;
    if (values[target]) continue;

    const cleaned = cleanText(rawRow[header]);
    if (cleaned === null) continue;

    values[target] = cleaned;
  }

  return values;
}

