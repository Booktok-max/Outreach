/**
 * De-duplication rules (pure).
 *
 * Four independent checks, evaluated in this order for each row:
 *   1. SOURCE_ROW              - identical mapped values as an earlier row in the file.
 *   2. EMAIL_IN_BATCH          - same email *for the same book* as an earlier row.
 *   3. RELATIONSHIP_EXISTING   - the person/book link already exists in the database.
 *   4. EMAIL_EXISTING          - the email already belongs to a database person.
 *
 * Nothing is ever deleted. Rows are labelled DUPLICATE and stay reviewable, and
 * the operator can explicitly choose to import EMAIL_EXISTING rows at commit
 * time to attach new books to an existing contact.
 */

export type DuplicateKindValue =
  | "SOURCE_ROW"
  | "EMAIL_IN_BATCH"
  | "EMAIL_EXISTING"
  | "RELATIONSHIP_EXISTING";

export interface DuplicateDecision {
  duplicate: boolean;
  kind: DuplicateKindValue | null;
  message: string | null;
  /** Row number of the earlier row that caused the duplicate (same file). */
  duplicateOfRow: number | null;
}

export interface ExistingDatabaseSnapshot {
  /** normalized email -> human readable existing person label */
  emails: Map<string, string>;
  /** identity key -> human readable existing relationship label */
  relationships: Map<string, string>;
}

export interface BatchRowIdentity {
  rowNumber: number;
  sourceFingerprint: string;
  identityKey: string | null;
  emailNormalized: string | null;
}

export const DUPLICATE_KIND_LABELS: Record<DuplicateKindValue, string> = {
  SOURCE_ROW: "Duplicate source row",
  EMAIL_IN_BATCH: "Duplicate email (same book, same file)",
  EMAIL_EXISTING: "Email already in database",
  RELATIONSHIP_EXISTING: "Relationship already in database",
};

export function emptyExistingSnapshot(): ExistingDatabaseSnapshot {
  return { emails: new Map(), relationships: new Map() };
}

export function classifyDuplicates(
  rows: BatchRowIdentity[],
  existing: ExistingDatabaseSnapshot,
): Map<number, DuplicateDecision> {
  const decisions = new Map<number, DuplicateDecision>();

  const seenFingerprints = new Map<string, number>();
  const seenIdentities = new Map<string, number>();

  for (const row of rows) {
    let decision: DuplicateDecision = {
      duplicate: false,
      kind: null,
      message: null,
      duplicateOfRow: null,
    };

    const fingerprintFirstSeen = seenFingerprints.get(row.sourceFingerprint);
    if (fingerprintFirstSeen !== undefined) {
      decision = {
        duplicate: true,
        kind: "SOURCE_ROW",
        message: `Identical to row ${fingerprintFirstSeen} in this file (all mapped values match).`,
        duplicateOfRow: fingerprintFirstSeen,
      };
    } else if (row.identityKey) {
      const identityFirstSeen = seenIdentities.get(row.identityKey);
      if (identityFirstSeen !== undefined) {
        decision = {
          duplicate: true,
          kind: "EMAIL_IN_BATCH",
          message: `Email already used by row ${identityFirstSeen} for the same book in this file.`,
          duplicateOfRow: identityFirstSeen,
        };
      } else if (existing.relationships.has(row.identityKey)) {
        decision = {
          duplicate: true,
          kind: "RELATIONSHIP_EXISTING",
          message: `Already in the database: ${existing.relationships.get(row.identityKey)}.`,
          duplicateOfRow: null,
        };
      }
    }

    if (!decision.duplicate && row.emailNormalized) {
      const existingLabel = existing.emails.get(row.emailNormalized);
      if (existingLabel !== undefined) {
        decision = {
          duplicate: true,
          kind: "EMAIL_EXISTING",
          message: `Email already belongs to an existing contact (${existingLabel}). Import it only if you want to attach this book to that contact.`,
          duplicateOfRow: null,
        };
      }
    }

    // Track "first seen" only for rows that are not themselves duplicates of an
    // earlier row, so the reported duplicate-of pointer stays stable.
    if (!seenFingerprints.has(row.sourceFingerprint)) {
      seenFingerprints.set(row.sourceFingerprint, row.rowNumber);
    }
    if (row.identityKey && !seenIdentities.has(row.identityKey)) {
      seenIdentities.set(row.identityKey, row.rowNumber);
    }

    decisions.set(row.rowNumber, decision);
  }

  return decisions;
}
