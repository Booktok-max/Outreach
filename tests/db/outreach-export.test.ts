/**
 * 7. Review/approval persistence and 8. Export eligibility/query behaviour.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { fetchExportRecords, getExportSummary } from "@/lib/export/queries";
import { applyOutreachDecision, DecisionError } from "@/lib/outreach/actions";

import { resetDatabase } from "./helpers";

async function createContact(input: {
  fullName: string;
  email: string;
  title: string;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "SUPPRESSED";
  emailStatus?: "VALID" | "INVALID" | "UNKNOWN";
}) {
  const person = await prisma.person.create({
    data: {
      fullName: input.fullName,
      primaryEmail: input.email,
      emailStatus: input.emailStatus ?? "VALID",
    },
  });
  const book = await prisma.book.create({
    data: {
      title: input.title,
      normalizedTitle: input.title.toLowerCase(),
      quickKey: `${input.title.toLowerCase()}|${input.fullName.toLowerCase()}`,
    },
  });
  await prisma.personBook.create({
    data: { personId: person.id, bookId: book.id, role: "AUTHOR", isPrimaryBook: true },
  });
  await prisma.outreachStatus.create({
    data: { personId: person.id, status: input.status ?? "PENDING" },
  });
  return person;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("review decisions", () => {
  it("persists approval and appends an audit event", async () => {
    const person = await createContact({
      fullName: "Jane Doe",
      email: "jane@example.com",
      title: "A Great Book",
    });

    const result = await applyOutreachDecision({
      personIds: [person.id],
      action: "approve",
      note: "Great fit",
      actor: "operator",
    });

    expect(result.changed).toBe(1);
    expect(result.missingPersonIds).toEqual([]);

    const status = await prisma.outreachStatus.findFirstOrThrow({ where: { personId: person.id } });
    expect(status.status).toBe("APPROVED");
    expect(status.decisionNote).toBe("Great fit");
    expect(status.reviewedBy).toBe("operator");
    expect(status.reviewedAt).not.toBeNull();

    const events = await prisma.outreachEvent.findMany({ where: { personId: person.id } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("APPROVED");
    expect(events[0].fromState).toBe("PENDING");
    expect(events[0].toState).toBe("APPROVED");
    expect(events[0].actor).toBe("operator");
  });

  it("records a suppression reason and keeps the record", async () => {
    const person = await createContact({
      fullName: "John Roe",
      email: "john@example.com",
      title: "Another Book",
    });

    await applyOutreachDecision({
      personIds: [person.id],
      action: "suppress",
      reason: "DO_NOT_CONTACT",
      actor: "operator",
    });

    const status = await prisma.outreachStatus.findFirstOrThrow({ where: { personId: person.id } });
    expect(status.status).toBe("SUPPRESSED");
    expect(status.suppressionReason).toBe("DO_NOT_CONTACT");

    // Suppression is a state, never a delete.
    expect(await prisma.person.count()).toBe(1);

    const event = await prisma.outreachEvent.findFirstOrThrow({ where: { personId: person.id } });
    expect(event.type).toBe("SUPPRESSED");
    expect(event.reason).toBe("DO_NOT_CONTACT");
  });

  it("requires a reason when suppressing", async () => {
    const person = await createContact({
      fullName: "No Reason",
      email: "noreason@example.com",
      title: "A Book",
    });

    await expect(
      applyOutreachDecision({ personIds: [person.id], action: "suppress" }),
    ).rejects.toThrow(DecisionError);

    expect(await prisma.outreachEvent.count()).toBe(0);
  });

  it("reports unknown person ids without writing anything", async () => {
    const result = await applyOutreachDecision({
      personIds: ["does-not-exist"],
      action: "approve",
    });

    expect(result.requested).toBe(1);
    expect(result.changed).toBe(0);
    expect(result.missingPersonIds).toEqual(["does-not-exist"]);
    expect(await prisma.outreachEvent.count()).toBe(0);
  });

  it("applies a decision to several people at once", async () => {
    const people = await Promise.all([
      createContact({ fullName: "One", email: "one@example.com", title: "B1" }),
      createContact({ fullName: "Two", email: "two@example.com", title: "B2" }),
    ]);

    const result = await applyOutreachDecision({
      personIds: people.map((person) => person.id),
      action: "approve",
      actor: "operator",
    });

    expect(result.changed).toBe(2);
    expect(await prisma.outreachStatus.count({ where: { status: "APPROVED" } })).toBe(2);
    expect(await prisma.outreachEvent.count()).toBe(2);
  });
});

describe("export eligibility", () => {
  it("exports only approved contacts with a valid email by default", async () => {
    const approved = await createContact({
      fullName: "Approved",
      email: "approved@example.com",
      title: "Approved Book",
      status: "APPROVED",
    });
    await createContact({
      fullName: "Pending",
      email: "pending@example.com",
      title: "Pending Book",
      status: "PENDING",
    });
    await createContact({
      fullName: "Suppressed",
      email: "suppressed@example.com",
      title: "Suppressed Book",
      status: "SUPPRESSED",
    });

    const records = await fetchExportRecords({ scope: "default" });
    expect(records).toHaveLength(1);
    expect(records[0].personId).toBe(approved.id);
    expect(records[0].email).toBe("approved@example.com");
    expect(records[0].outreachStatus).toBe("APPROVED");
  });

  it("excludes approved contacts whose email is not valid", async () => {
    await createContact({
      fullName: "Bad Email",
      email: "bad@example.com",
      title: "A Book",
      status: "APPROVED",
      emailStatus: "INVALID",
    });

    const records = await fetchExportRecords({ scope: "default" });
    expect(records).toHaveLength(0);
  });

  it("includes book and role columns from the persisted relationships", async () => {
    await createContact({
      fullName: "Provenanced",
      email: "prov@example.com",
      title: "Provenance Book",
      status: "APPROVED",
    });

    const [record] = await fetchExportRecords({ scope: "default" });
    expect(record.bookTitle).toBe("Provenance Book");
    expect(record.bookRole).toBe("AUTHOR");
  });

  it("scopes an export to explicitly selected people", async () => {
    const wanted = await createContact({
      fullName: "Wanted",
      email: "wanted@example.com",
      title: "Wanted Book",
    });
    await createContact({
      fullName: "Other",
      email: "other@example.com",
      title: "Other Book",
    });

    const records = await fetchExportRecords({ scope: "selected", personIds: [wanted.id] });
    expect(records).toHaveLength(1);
    expect(records[0].personId).toBe(wanted.id);
  });

  it("summarises ready, suppressed and rejected counts", async () => {
    await createContact({
      fullName: "Ready",
      email: "ready@example.com",
      title: "B1",
      status: "APPROVED",
    });
    await createContact({
      fullName: "Rejected",
      email: "rejected@example.com",
      title: "B2",
      status: "REJECTED",
    });
    await createContact({
      fullName: "Suppressed",
      email: "sup@example.com",
      title: "B3",
      status: "SUPPRESSED",
    });

    const summary = await getExportSummary({ scope: "all" });
    expect(summary.reviewed).toBe(3);
    expect(summary.ready).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.suppressed).toBe(1);
    expect(summary.valid).toBe(3);
  });
});
