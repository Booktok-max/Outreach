import { describe, expect, it } from "vitest";

import {
  buildBookQuickKey,
  buildFullName,
  normalizeEmail,
  normalizeIsbn,
  normalizePhone,
  normalizePublicationDate,
  normalizeSeriesPosition,
  normalizeUrl,
  parseFullName,
  unwrapEmail,
} from "@/lib/domain/values";

describe("domain values", () => {
  describe("normalizeEmail", () => {
    it("normalizes and validates normal email", () => {
      const res = normalizeEmail("  Test.User@Example.COM  ");
      expect(res).not.toBeNull();
      expect(res?.valid).toBe(true);
      expect(res?.normalized).toBe("test.user@example.com");
      expect(res?.value).toBe("Test.User@Example.COM");
    });

    it("unwraps mailto: and brackets", () => {
      expect(unwrapEmail("mailto:<author@domain.com>")).toBe("author@domain.com");
      const res = normalizeEmail("mailto:<author@domain.com>");
      expect(res?.valid).toBe(true);
      expect(res?.normalized).toBe("author@domain.com");
    });

    it("marks invalid email syntax as invalid", () => {
      const res = normalizeEmail("not-an-email");
      expect(res?.valid).toBe(false);
      expect(res?.reason).toBe("not a valid email address");
    });

    it("returns null for empty email", () => {
      expect(normalizeEmail("   ")).toBeNull();
      expect(normalizeEmail(null)).toBeNull();
    });
  });

  describe("normalizeUrl", () => {
    it("keeps valid https url", () => {
      const res = normalizeUrl("https://author.com/books");
      expect(res?.valid).toBe(true);
      expect(res?.normalized).toBe("https://author.com/books");
    });

    it("auto prefixes bare domain with https:// and records reason", () => {
      const res = normalizeUrl("author.com/my-page");
      expect(res?.valid).toBe(true);
      expect(res?.normalized).toBe("https://author.com/my-page");
      expect(res?.reason).toBe("missing scheme - https:// was added");
    });


    it("flags non-http protocols or invalid URLs", () => {
      const res = normalizeUrl("ftp://files.example.com");
      expect(res?.valid).toBe(false);
      expect(res?.reason).toContain("unsupported protocol");
    });
  });

  describe("name parsing and construction", () => {
    it("parses first and last names", () => {
      const res1 = parseFullName("John Doe");
      expect(res1.firstName).toBe("John");
      expect(res1.lastName).toBe("Doe");

      const res2 = parseFullName("Jane A. Smith");
      expect(res2.firstName).toBe("Jane");
      expect(res2.lastName).toBe("Smith");
    });

    it("parses Last, First format", () => {
      const res = parseFullName("Doe, John");
      expect(res.firstName).toBe("John");
      expect(res.lastName).toBe("Doe");
    });

    it("builds full name", () => {
      expect(buildFullName("John", "Doe")).toBe("John Doe");
      expect(buildFullName("John", null)).toBe("John");
      expect(buildFullName(null, "Doe")).toBe("Doe");
      expect(buildFullName(null, null)).toBeNull();
    });
  });

  describe("book helpers", () => {
    it("builds book quick key", () => {
      expect(buildBookQuickKey("The Great Gatsby", "F. Scott Fitzgerald")).toBe(
        "the great gatsby||f scott fitzgerald",
      );
      expect(buildBookQuickKey(null, "Author")).toBeNull();
    });

    it("normalizes series position", () => {
      expect(normalizeSeriesPosition("Book 3")).toBe(3);
      expect(normalizeSeriesPosition("#2")).toBe(2);
      expect(normalizeSeriesPosition("Volume IV")).toBe(null);
    });


    it("normalizes ISBN", () => {
      expect(normalizeIsbn("978-0-123456-47-2")).toBe("9780123456472");
      expect(normalizeIsbn("0-123456-47-X")).toBe("012345647X");
      expect(normalizeIsbn("123")).toBeNull();
    });

    it("normalizes phone", () => {
      expect(normalizePhone("+1 (555) 123-4567")).toBe("+1 (555) 123-4567");
      expect(normalizePhone("123")).toBeNull();
    });

    it("normalizes publication date", () => {
      expect(normalizePublicationDate("2023-05-12")).toBe("2023-05-12");
      expect(normalizePublicationDate("2023")).toBe("2023-01-01");
      expect(normalizePublicationDate("May 12, 2023")).toBe("2023-05-12");
      expect(normalizePublicationDate("invalid date")).toBeNull();
    });
  });
});
