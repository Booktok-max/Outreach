import { prisma } from "@/lib/db";
import { applyOutreachDecision } from "@/lib/outreach/actions";

export * from "./token";

import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./token";

export type UnsubscribeResult =
  | { status: "unsubscribed"; personId: string; alreadySuppressed: false }
  | { status: "already"; personId: string; alreadySuppressed: true }
  | { status: "invalid" }
  | { status: "not_found" };

export async function unsubscribeContact(token: string | null | undefined): Promise<UnsubscribeResult> {
  const payload = await verifyUnsubscribeToken(token);
  if (!payload) return { status: "invalid" };

  const person = await prisma.person.findUnique({
    where: { id: payload.pid },
    select: { id: true },
  });
  if (!person) return { status: "not_found" };

  const previous = await prisma.outreachStatus.findUnique({
    where: { personId: person.id },
    select: { status: true },
  });
  const alreadySuppressed = previous?.status === "SUPPRESSED";

  await applyOutreachDecision({
    personIds: [person.id],
    action: "suppress",
    reason: "UNSUBSCRIBE",
    note: payload.ctx
      ? `Unsubscribe link request (campaign: ${payload.ctx})`
      : "Unsubscribe link request",
    actor: "unsubscribe-link",
    source: "unsubscribe-link",
  });

  return alreadySuppressed
    ? { status: "already", personId: person.id, alreadySuppressed: true }
    : { status: "unsubscribed", personId: person.id, alreadySuppressed: false };
}

// Re-export helper for convenience.
export { createUnsubscribeToken, verifyUnsubscribeToken };