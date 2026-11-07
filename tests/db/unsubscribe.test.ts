import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { fetchExportRecords } from "@/lib/export/queries";
import { applyOutreachDecision } from "@/lib/outreach/actions";
import { listUnsubscribedContacts } from "@/lib/unsubscribed";
import { createUnsubscribeToken, unsubscribeContact } from "@/lib/unsubscribe";
import { GET as unsubscribeGet, POST as unsubscribePost } from "@/app/unsubscribe/route";
import { GET as apiGet, POST as apiPost } from "@/app/api/unsubscribe/route";

import { resetDatabase } from "./helpers";

async function createContact(input: {
  fullName: string;
  email: string;
  title: string;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "SUPPRESSED";
}) {
  const person = await prisma.person.create({
    data: {
      fullName: input.fullName,
      primaryEmail: input.email,
      emailStatus: "VALID",
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

describe("unsubscribe flow", () => {
  it("valid token unsubscribes the correct contact", async () => {
    const person = await createContact({ fullName: "Jane Doe", email: "jane@example.com", title: "Book" });
    const token = await createUnsubscribeToken(person.id, { campaign: "spring" });

    const result = await unsubscribeContact(token);
    expect(result.status).toBe("unsubscribed");
    if (result.status === "unsubscribed") expect(result.personId).toBe(person.id);

    const status = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } });
    expect(status.status).toBe("SUPPRESSED");
    expect(status.suppressionReason).toBe("UNSUBSCRIBE");
    expect(status.source).toBe("unsubscribe-link");
  });

  it("invalid token is rejected safely", async () => {
    const result = await unsubscribeContact("definitely-not-a-token");
    expect(result.status).toBe("invalid");
    expect(await prisma.outreachStatus.count({ where: { status: "SUPPRESSED" } })).toBe(0);
  });

  it("altered token cannot target a different contact", async () => {
    const a = await createContact({ fullName: "A", email: "a@example.com", title: "B1" });
    const b = await createContact({ fullName: "B", email: "b@example.com", title: "B2" });
    const token = await createUnsubscribeToken(a.id);

    // Tamper the payload to point at b while keeping the signature.
    const [body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    decoded.pid = b.id;
    const newBody = Buffer.from(JSON.stringify(decoded)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const tampered = `${newBody}.${signature}`;

    const result = await unsubscribeContact(tampered);
    expect(result.status).toBe("invalid");

    const bStatus = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: b.id } });
    expect(bStatus.status).not.toBe("SUPPRESSED");
  });

  it("repeated unsubscribe requests are idempotent", async () => {
    const person = await createContact({ fullName: "Repeat", email: "repeat@example.com", title: "Book" });
    const token = await createUnsubscribeToken(person.id);

    const first = await unsubscribeContact(token);
    const second = await unsubscribeContact(token);
    expect(first.status).toBe("unsubscribed");
    expect(second.status).toBe("already");

    const status = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } });
    expect(status.status).toBe("SUPPRESSED");
  });

  it("persists suppression and an audit record", async () => {
    const person = await createContact({ fullName: "Audit", email: "audit@example.com", title: "Book" });
    const token = await createUnsubscribeToken(person.id, { campaign: "ctx" });

    await unsubscribeContact(token);

    const events = await prisma.outreachEvent.findMany({ where: { personId: person.id } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SUPPRESSED");
    expect(events[0].reason).toBe("UNSUBSCRIBE");
    expect(events[0].source).toBe("unsubscribe-link");
    expect(events[0].note).toContain("ctx");
    expect(events[0].actor).toBe("unsubscribe-link");
  });

  it("preserves existing suppression reasons and history", async () => {
    const person = await createContact({ fullName: "Manual", email: "manual@example.com", title: "Book" });
    await applyOutreachDecision({
      personIds: [person.id],
      action: "suppress",
      reason: "DO_NOT_CONTACT",
      note: "manual block",
      actor: "operator",
      source: "manual",
    });

    const beforeEvents = await prisma.outreachEvent.count({ where: { personId: person.id } });
    const beforeReason = (await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } })).suppressionReason;
    expect(beforeReason).toBe("DO_NOT_CONTACT");

    // A link unsubscribe on an already suppressed contact keeps audit trail append-only.
    const token = await createUnsubscribeToken(person.id);
    await unsubscribeContact(token);

    const afterEvents = await prisma.outreachEvent.count({ where: { personId: person.id } });
    expect(afterEvents).toBe(beforeEvents + 1);
    const status = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } });
    expect(status.status).toBe("SUPPRESSED");
    // Reason becomes UNSUBSCRIBE because the contact explicitly unsubscribed.
    expect(status.suppressionReason).toBe("UNSUBSCRIBE");
  });

  it("excludes unsubscribed contacts from exports", async () => {
    const person = await createContact({ fullName: "Export", email: "export@example.com", title: "Book", status: "APPROVED" });
    const token = await createUnsubscribeToken(person.id);
    await unsubscribeContact(token);

    const records = await fetchExportRecords({ scope: "default" });
    expect(records).toHaveLength(0);

    const selected = await fetchExportRecords({ scope: "selected", personIds: [person.id] });
    // selected fetches the record, but GMass filtering happens in selectExportableRecords.
    expect(selected).toHaveLength(1);
  });

  it("authorized-style query lists and searches unsubscribed contacts", async () => {
    const person = await createContact({ fullName: "Searchable", email: "findme@example.com", title: "Book" });
    const token = await createUnsubscribeToken(person.id);
    await unsubscribeContact(token);

    const result = await listUnsubscribedContacts({ search: "findme" });
    expect(result.total).toBe(1);
    expect(result.items[0].email).toBe("findme@example.com");
    expect(result.items[0].source).toBe("unsubscribe-link");
  });

  it("paginates and sorts unsubscribed contacts", async () => {
    for (let i = 0; i < 3; i++) {
      const person = await createContact({ fullName: `P${i}`, email: `p${i}@example.com`, title: "Book" });
      const token = await createUnsubscribeToken(person.id);
      await unsubscribeContact(token);
    }

    const page1 = await listUnsubscribedContacts({ page: 1, pageSize: 2, sort: "email_asc" });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.items[0].email).toBe("p0@example.com");

    const page2 = await listUnsubscribedContacts({ page: 2, pageSize: 2, sort: "email_asc" });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].email).toBe("p2@example.com");
  });

  it("GET preview does not suppress and POST confirmation suppresses", async () => {
    const person = await createContact({ fullName: "Preview", email: "preview@example.com", title: "Book", status: "APPROVED" });
    const token = await createUnsubscribeToken(person.id);

    const getUrl = `http://localhost/unsubscribe?token=${encodeURIComponent(token)}`;
    const getResponse = await unsubscribeGet(new Request(getUrl));
    expect(getResponse.status).toBe(200);
    const before = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } });
    expect(before.status).toBe("APPROVED");

    const postResponse = await unsubscribePost(new Request("http://localhost/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${encodeURIComponent(token)}`,
    }));
    expect(postResponse.status).toBe(200);
    const after = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } });
    expect(after.status).toBe("SUPPRESSED");
  });

  it("API GET is non-mutating and POST performs one-click unsubscribe", async () => {
    const person = await createContact({ fullName: "OneClick", email: "oneclick@example.com", title: "Book", status: "APPROVED" });
    const token = await createUnsubscribeToken(person.id);

    const apiGetUrl = `http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`;
    const getResponse = await apiGet(new Request(apiGetUrl));
    expect(getResponse.status).toBe(200);
    const before = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } });
    expect(before.status).toBe("APPROVED");

    // RFC 8058 one-click POST may include this body.
    const postResponse = await apiPost(new Request(apiGetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }));
    expect(postResponse.status).toBe(200);
    const after = await prisma.outreachStatus.findUniqueOrThrow({ where: { personId: person.id } });
    expect(after.status).toBe("SUPPRESSED");
  });

  it("rejects invalid tokens on GET and POST", async () => {
    const getResponse = await unsubscribeGet(new Request("http://localhost/unsubscribe?token=bad"));
    expect(getResponse.status).toBe(400);
    const postResponse = await unsubscribePost(new Request("http://localhost/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "token=bad",
    }));
    expect(postResponse.status).toBe(400);
  });
});