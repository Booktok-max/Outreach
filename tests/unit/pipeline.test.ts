import { describe, expect, it } from "vitest";

import { normalizeCanonicalValues } from "@/lib/domain/normalize";
import { validateNormalizedRow } from "@/lib/domain/validate";
import { classifyDuplicates, emptyExistingSnapshot } from "@/lib/domain/dedupe";
import type { CanonicalValues } from "@/lib/import/mapping";

describe("pipeline: normalize -> validate -> dedupe", () => {
  it("processes a valid row", () => {
    const raw: CanonicalValues = {
      email: "author@example.com",
      authorName: "Jane Doe",
      bookTitle: "A Great Book",
      genre: "Sci-Fi",
      websiteUrl: "janedoe.com",
    };

    const normalized = normalizeCanonicalValues(raw);
    expect(normalized.email?.valid).toBe(true);
    expect(normalized.fullName).toBe("Jane Doe");
    expect(normalized.urls.websiteUrl?.normalized).toBe("https://janedoe.com/");

    const validation = validateNormalizedRow(normalized);

    expect(validation.status).toBe("valid");
    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings).toHaveLength(1); // URL auto-prefix warning
  });

  it("identifies missing or invalid email as an error", () => {
    const rawNoEmail: CanonicalValues = {
      authorName: "Jane Doe",
      bookTitle: "A Great Book",
    };
    const normNoEmail = normalizeCanonicalValues(rawNoEmail);
    const valNoEmail = validateNormalizedRow(normNoEmail);
    expect(valNoEmail.status).toBe("invalid");
    expect(valNoEmail.errors.some((e) => e.code === "EMAIL_MISSING")).toBe(true);

    const rawBadEmail: CanonicalValues = {
      email: "bad-email",
      authorName: "Jane Doe",
      bookTitle: "A Great Book",
    };
    const normBadEmail = normalizeCanonicalValues(rawBadEmail);
    const valBadEmail = validateNormalizedRow(normBadEmail);
    expect(valBadEmail.status).toBe("invalid");
    expect(valBadEmail.errors.some((e) => e.code === "EMAIL_INVALID")).toBe(true);
  });

  it("classifies duplicate rows correctly", () => {
    const raw1: CanonicalValues = {
      email: "author@example.com",
      authorName: "Jane Doe",
      bookTitle: "A Great Book",
    };
    const raw2: CanonicalValues = {
      email: "author@example.com",
      authorName: "Jane Doe",
      bookTitle: "A Great Book",
    };
    const raw3: CanonicalValues = {
      email: "author@example.com",
      authorName: "Jane Doe",
      bookTitle: "Another Book",
    };

    const norm1 = normalizeCanonicalValues(raw1);
    const norm2 = normalizeCanonicalValues(raw2);
    const norm3 = normalizeCanonicalValues(raw3);

    const rows = [
      {
        rowNumber: 1,
        sourceFingerprint: norm1.sourceFingerprint,
        identityKey: norm1.identityKey,
        emailNormalized: norm1.email?.normalized ?? null,
      },
      {
        rowNumber: 2,
        sourceFingerprint: norm2.sourceFingerprint,
        identityKey: norm2.identityKey,
        emailNormalized: norm2.email?.normalized ?? null,
      },
      {
        rowNumber: 3,
        sourceFingerprint: norm3.sourceFingerprint,
        identityKey: norm3.identityKey,
        emailNormalized: norm3.email?.normalized ?? null,
      },
    ];

    const existing = emptyExistingSnapshot();
    const decisions = classifyDuplicates(rows, existing);

    expect(decisions.get(1)?.duplicate).toBe(false);
    expect(decisions.get(2)?.duplicate).toBe(true);
    expect(decisions.get(2)?.kind).toBe("SOURCE_ROW");
    expect(decisions.get(2)?.duplicateOfRow).toBe(1);
    expect(decisions.get(3)?.duplicate).toBe(false);
  });

  it("detects existing database email and relationship duplicates", () => {
    const raw: CanonicalValues = {
      email: "existing@example.com",
      authorName: "Known Author",
      bookTitle: "Known Book",
    };
    const norm = normalizeCanonicalValues(raw);

    const existing = emptyExistingSnapshot();
    existing.emails.set("existing@example.com", "Known Author");

    const rows = [
      {
        rowNumber: 1,
        sourceFingerprint: norm.sourceFingerprint,
        identityKey: norm.identityKey,
        emailNormalized: norm.email?.normalized ?? null,
      },
    ];

    const decisions = classifyDuplicates(rows, existing);
    expect(decisions.get(1)?.duplicate).toBe(true);
    expect(decisions.get(1)?.kind).toBe("EMAIL_EXISTING");
  });
});
