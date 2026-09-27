import { chunk } from "@/lib/collections";
import { prisma } from "@/lib/db";

/**
 * Outreach review actions: approve / reject / suppress / reset.
 *
 * Every decision is recorded on `outreach_status` and in the append-only
 * `outreach_event` trail so the record page can show who changed what and why.
 * Suppression is a state, never a delete: suppressed contacts stay in the
 * database and are simply excluded from the default GMass export.
 */

export const SUPPRESSION_REASONS = [
  "MANUAL",
  "UNSUBSCRIBE",
  "PREVIOUS_CLIENT",
  "DUPLICATE",
  "INVALID",
  "DO_NOT_CONTACT",
] as const;

export type SuppressionReasonValue = (typeof SUPPRESSION_REASONS)[number];

export const OUTREACH_ACTIONS = ["approve", "reject", "suppress", "unsuppress", "reset"] as const;
export type OutreachAction = (typeof OUTREACH_ACTIONS)[number];

export interface DecisionInput {
  personIds: string[];
  action: OutreachAction;
  reason?: SuppressionReasonValue | null;
  note?: string | null;
  actor?: string | null;
}

export interface DecisionResult {
  action: OutreachAction;
  requested: number;
  changed: number;
  missingPersonIds: string[];
}

const MAX_BULK_IDS = 5000;

function eventTypeFor(
  action: OutreachAction,
): "APPROVED" | "REJECTED" | "SUPPRESSED" | "UNSUPPRESSED" | "RESET" {
  switch (action) {
    case "approve":
      return "APPROVED";
    case "reject":
      return "REJECTED";
    case "suppress":
      return "SUPPRESSED";
    case "unsuppress":
      return "UNSUPPRESSED";
    case "reset":
      return "RESET";
    default:
      return "RESET";
  }
}

export function targetStateFor(action: OutreachAction): "APPROVED" | "REJECTED" | "SUPPRESSED" | "PENDING" {
  switch (action) {
    case "approve":
      return "APPROVED";
    case "reject":
      return "REJECTED";
    case "suppress":
      return "SUPPRESSED";
    case "unsuppress":
    case "reset":
      return "PENDING";
    default:
      return "PENDING";
  }
}

export interface DecisionValidation {
  ok: boolean;
  errors: string[];
}

/** Input validation shared by the single and bulk endpoints. */
export function validateDecision(input: DecisionInput): DecisionValidation {
  const errors: string[] = [];

  if (!Array.isArray(input.personIds) || input.personIds.length === 0) {
    errors.push("Select at least one record.");
  }
  if (input.personIds.length > MAX_BULK_IDS) {
    errors.push(`Bulk actions are limited to ${MAX_BULK_IDS} records per request.`);
  }
  if (!OUTREACH_ACTIONS.includes(input.action)) {
    errors.push("Unknown action.");
  }
  if (input.action === "suppress") {
    if (!input.reason || !SUPPRESSION_REASONS.includes(input.reason)) {
      errors.push("Suppression requires a reason.");
    }
  }
  if (input.note && input.note.length > 2000) {
    errors.push("Notes are limited to 2000 characters.");
  }

  return { ok: errors.length === 0, errors };
}

const CHUNK_SIZE = 200;


/**
 * Applies a review decision to one or many people in a single pass.
 * Idempotent: applying the same decision twice records two events but keeps
 * the same state.
 */
export async function applyOutreachDecision(input: DecisionInput): Promise<DecisionResult> {
  const validation = validateDecision(input);
  if (!validation.ok) {
    throw new DecisionError(validation.errors);
  }

  const personIds = Array.from(new Set(input.personIds)).slice(0, MAX_BULK_IDS);
  const targetState = targetStateFor(input.action);
  const type = eventTypeFor(input.action);
  const now = new Date();

  const existing = await prisma.person.findMany({
    where: { id: { in: personIds } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((person) => person.id));
  const missingPersonIds = personIds.filter((id) => !existingIds.has(id));

  let changed = 0;

  for (const slice of chunk(Array.from(existingIds), CHUNK_SIZE)) {
    await prisma.$transaction(async (tx) => {
      for (const personId of slice) {
        const previous = await tx.outreachStatus.findUnique({ where: { personId } });
        const fromState = previous?.status ?? null;

        await tx.outreachStatus.upsert({
          where: { personId },
          create: {
            personId,
            status: targetState,
            suppressionReason:
              input.action === "suppress" ? (input.reason as SuppressionReasonValue) : null,
            notes: input.note ?? previous?.notes ?? null,
            decisionNote: input.note ?? null,
            reviewedBy: input.actor ?? null,
            reviewedAt: now,
          },
          update: {
            status: targetState,
            suppressionReason:
              input.action === "suppress" ? (input.reason as SuppressionReasonValue) : null,
            decisionNote: input.note ?? null,
            reviewedBy: input.actor ?? null,
            reviewedAt: now,
          },
        });

        await tx.outreachEvent.create({
          data: {
            personId,
            type,
            fromState,
            toState: targetState,
            reason: input.action === "suppress" ? (input.reason as SuppressionReasonValue) : null,
            note: input.note ?? null,
            actor: input.actor ?? null,
          },
        });

        changed += 1;
      }
    });
  }

  return { action: input.action, requested: personIds.length, changed, missingPersonIds };
}

export class DecisionError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(" "));
    this.name = "DecisionError";
    this.issues = issues;
  }
}

