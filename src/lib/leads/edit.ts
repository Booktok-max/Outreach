import { prisma } from "@/lib/db";
import { normalizeEmail, normalizeUrl } from "@/lib/domain/values";
import { refreshPersonCaches, type DbClient } from "@/lib/persistence/writes";
import { cleanSingleLine } from "@/lib/text";

/** Thrown when the operator submits a value that fails validation. */
export class LeadEditError extends Error {
  readonly issues: Array<{ field: string; message: string }>;

  constructor(issues: Array<{ field: string; message: string }>) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "));
    this.name = "LeadEditError";
    this.issues = issues;
  }
}

export interface LeadEditInput {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  penName?: string | null;
  organization?: string | null;
  role?: string | null;
  notes?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  tiktokUrl?: string | null;
  goodreadsUrl?: string | null;
}

const URL_FIELDS = [
  "websiteUrl",
  "twitterUrl",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
  "tiktokUrl",
  "goodreadsUrl",
] as const;

const TEXT_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "penName",
  "organization",
  "role",
  "notes",
] as const;

/**
 * Updates a single record.
 *
 * Rules:
 *  * the email must stay syntactically valid and unique across contacts,
 *  * URLs must be structurally valid (missing schemes are repaired),
 *  * derived caches (primary email, email status, search text) are recomputed.
 */
export async function updateLead(personId: string, input: LeadEditInput): Promise<void> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, primaryEmail: true },
  });
  if (!person) throw new Error("LEAD_NOT_FOUND");

  const issues: Array<{ field: string; message: string }> = [];

  let nextEmail: { value: string; normalized: string; valid: boolean; reason?: string } | null =
    null;

  if (input.email !== undefined && input.email !== null) {
    const cleaned = cleanSingleLine(input.email);
    if (cleaned) {
      const parsed = normalizeEmail(cleaned);
      if (!parsed || !parsed.valid) {
        issues.push({
          field: "email",
          message: parsed?.reason
            ? `Not a valid email address (${parsed.reason}).`
            : "Not a valid email address.",
        });
      } else if (parsed.normalized !== person.primaryEmail) {
        const conflict = await prisma.contactPoint.findUnique({
          where: {
            type_normalizedValue: {
              type: "EMAIL",
              normalizedValue: parsed.normalized,
            },
          },
          select: { personId: true },
        });
        if (conflict && conflict.personId !== personId) {
          issues.push({ field: "email", message: "This email already belongs to another record." });
        }
      }
      nextEmail = parsed;
    }
  }

  const urlPatch: Record<string, string | null> = {};
  for (const field of URL_FIELDS) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (raw === null || raw.trim().length === 0) {
      urlPatch[field] = null;
      continue;
    }
    const parsed = normalizeUrl(raw);
    if (!parsed || !parsed.valid) {
      issues.push({ field, message: parsed?.reason ?? "Not a valid URL." });
      continue;
    }
    urlPatch[field] = parsed.normalized;
  }

  if (issues.length > 0) throw new LeadEditError(issues);

  const textPatch: Record<string, string | null> = {};
  for (const field of TEXT_FIELDS) {
    const raw = input[field];
    if (raw === undefined) continue;
    textPatch[field] = raw === null ? null : (cleanSingleLine(raw) ?? "");
  }

  await prisma.$transaction(async (tx: DbClient) => {
    await tx.person.update({ where: { id: personId }, data: { ...textPatch, ...urlPatch } });

    if (nextEmail) {
      const existing = await tx.contactPoint.findFirst({
        where: { personId, type: "EMAIL" },
        select: { id: true },
        orderBy: { isPrimary: "desc" },
      });

      const emailData = {
        value: nextEmail.value,
        normalizedValue: nextEmail.normalized,
        status: nextEmail.valid ? ("VALID" as const) : ("INVALID" as const),
        validationMessage: nextEmail.valid ? null : (nextEmail.reason ?? null),
        isPrimary: true,
      };

      if (existing) {
        await tx.contactPoint.update({ where: { id: existing.id }, data: emailData });
      } else {
        await tx.contactPoint.create({
          data: { personId, type: "EMAIL", label: "primary email", ...emailData },
        });
      }
    }

    await refreshPersonCaches(tx, personId);
  });
}
