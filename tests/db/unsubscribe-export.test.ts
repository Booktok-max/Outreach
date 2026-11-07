import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as exportGet } from "@/app/api/unsubscribed/export/route";
import { getEnv } from "@/lib/env";
import { selectExportableRecords } from "@/lib/export/datasets";
import { fetchExportRecords } from "@/lib/export/queries";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session";
import { listUnsubscribedContacts } from "@/lib/unsubscribed";

import { resetDatabase } from "./helpers";

const CSV_HEADER = "Email,Name,SuppressedAt,Source,SuppressionReason,Status,Context";

async function authorizedRequest(url: string): Promise<Request> {
  const token = await createSessionToken(
    { sub: "export-test-operator", exp: Math.floor(Date.now() / 1000) + 60 },
    getEnv().SESSION_SECRET,
  );

  return new Request(url, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

function contactId(prefix: string, index: number): string {
  return `person-${prefix}-${String(index).padStart(3, "0")}`;
}

async function seedSuppressedContacts(input: {
  prefix: string;
  count: number;
  /** Use one timestamp for every row to exercise the id tie-break. */
  sameReviewedAt?: Date;
}): Promise<Array<{ id: string; primaryEmail: string; fullName: string }>> {
  const people = Array.from({ length: input.count }, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    const email = `${input.prefix}-${suffix}@example.com`;
    return {
      id: contactId(input.prefix, index),
      fullName: `Person ${input.prefix} ${suffix}`,
      primaryEmail: email,
      emailStatus: "VALID" as const,
      searchText: `${email} person ${input.prefix} ${suffix}`,
    };
  });

  await prisma.person.createMany({ data: people });

  await prisma.outreachStatus.createMany({
    data: people.map((person, index) => ({
      id: `status-${input.prefix}-${String(index).padStart(3, "0")}`,
      personId: person.id,
      status: "SUPPRESSED" as const,
      suppressionReason: "UNSUBSCRIBE" as const,
      source: "unsubscribe-link",
      reviewedAt:
        input.sameReviewedAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      decisionNote: `Context for ${person.primaryEmail}`,
    })),
  });

  return people;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("unsubscribed CSV export", () => {
  it("exports every matching contact beyond the dashboard cap and across batches", async () => {
    const matching = await seedSuppressedContacts({
      prefix: "match",
      count: 620,
      sameReviewedAt: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)),
    });
    await seedSuppressedContacts({ prefix: "other", count: 7 });

    const response = await exportGet(
      await authorizedRequest(
        "http://localhost/api/unsubscribed/export?search=match&sort=email_asc",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="unsubscribed-\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    const lines = (await response.text()).trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines).toHaveLength(matching.length + 1);

    const emails = lines.slice(1).map((line) => line.split(",")[0]);
    expect(emails).toEqual(matching.map((person) => person.primaryEmail));
    expect(new Set(emails).size).toBe(620);
    expect(emails).not.toContain("other-000@example.com");

    // The dashboard's display pagination is intentionally unchanged.
    const dashboard = await listUnsubscribedContacts({
      search: "match",
      pageSize: 5000,
      sort: "email_asc",
    });
    expect(dashboard.pageSize).toBe(200);
    expect(dashboard.total).toBe(620);
    expect(dashboard.items).toHaveLength(200);
    expect(dashboard.totalPages).toBe(4);
    expect(dashboard.items[0]?.email).toBe("match-000@example.com");
  });

  it("applies the search filter to the whole export", async () => {
    await seedSuppressedContacts({ prefix: "match", count: 5 });
    await seedSuppressedContacts({ prefix: "other", count: 3 });

    const response = await exportGet(
      await authorizedRequest("http://localhost/api/unsubscribed/export?search=other"),
    );

    expect(response.status).toBe(200);
    const lines = (await response.text()).trimEnd().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines.slice(1).map((line) => line.split(",")[0])).toEqual([
      "other-002@example.com",
      "other-001@example.com",
      "other-000@example.com",
    ]);
  });

  it("returns a valid header-only CSV when there are no matches", async () => {
    const response = await exportGet(
      await authorizedRequest("http://localhost/api/unsubscribed/export?search=nobody"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`${CSV_HEADER}\r\n`);
  });

  it("escapes commas, quotes, line breaks and spreadsheet formulas", async () => {
    await prisma.person.create({
      data: {
        id: "person-escaping",
        fullName: 'Doe, "Jane"\nSecond Line',
        primaryEmail: "escaping@example.com",
        emailStatus: "VALID",
      },
    });
    await prisma.outreachStatus.create({
      data: {
        personId: "person-escaping",
        status: "SUPPRESSED",
        suppressionReason: "UNSUBSCRIBE",
        source: "unsubscribe-link",
        decisionNote: '=HYPERLINK("https://evil.example","click")',
      },
    });

    const response = await exportGet(
      await authorizedRequest("http://localhost/api/unsubscribed/export"),
    );

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('"Doe, ""Jane""\nSecond Line"');
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://evil.example\"\",\"\"click\"\")\"");
  });

  it("rejects unauthenticated and invalid-session requests before reading data", async () => {
    await seedSuppressedContacts({ prefix: "private", count: 2 });

    const unauthenticated = await exportGet(
      new Request("http://localhost/api/unsubscribed/export"),
    );
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: "Authentication required." });
    expect(unauthenticated.headers.get("content-disposition")).toBeNull();

    const invalid = await exportGet(
      new Request("http://localhost/api/unsubscribed/export", {
        headers: { cookie: `${SESSION_COOKIE}=not-a-valid-token` },
      }),
    );
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("content-disposition")).toBeNull();
  });

  it("fails safely without returning partial CSV data when the database fails", async () => {
    await seedSuppressedContacts({ prefix: "failure", count: 1 });

    const findMany = vi
      .spyOn(prisma.outreachStatus, "findMany")
      .mockRejectedValueOnce(new Error("simulated database failure"));

    try {
      const response = await exportGet(
        await authorizedRequest("http://localhost/api/unsubscribed/export"),
      );

      expect(response.status).toBe(500);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({
        error: "Failed to export unsubscribed contacts.",
      });
    } finally {
      findMany.mockRestore();
    }
  });

  it("keeps suppressed contacts out of default and GMass export scopes", async () => {
    await prisma.person.createMany({
      data: [
        {
          id: "person-approved",
          fullName: "Approved",
          primaryEmail: "approved@example.com",
          emailStatus: "VALID",
        },
        {
          id: "person-blocked",
          fullName: "Blocked",
          primaryEmail: "blocked@example.com",
          emailStatus: "VALID",
        },
      ],
    });
    await prisma.outreachStatus.createMany({
      data: [
        { personId: "person-approved", status: "APPROVED" },
        {
          personId: "person-blocked",
          status: "SUPPRESSED",
          suppressionReason: "UNSUBSCRIBE",
          source: "unsubscribe-link",
        },
      ],
    });

    const defaultRecords = await fetchExportRecords({ scope: "default" });
    expect(defaultRecords.map((record) => record.personId)).toEqual(["person-approved"]);

    const allRecords = await fetchExportRecords({ scope: "all" });
    expect(allRecords).toHaveLength(2);
    expect(selectExportableRecords(allRecords).map((record) => record.personId)).toEqual([
      "person-approved",
    ]);
  });
});
