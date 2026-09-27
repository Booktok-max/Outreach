import { describe, expect, it } from "vitest";

import {
  cleanSingleLine,
  cleanText,
  compactKey,
  isFormulaInjectionRisk,
  isSafeHttpUrl,
  neutralizeFormulaValue,
  normalizeKey,
  shortSignature,
  stripTags,
} from "@/lib/text";

describe("text utilities", () => {
  describe("cleanText", () => {
    it("returns null for null, undefined or empty strings", () => {
      expect(cleanText(null)).toBeNull();
      expect(cleanText(undefined)).toBeNull();
      expect(cleanText("")).toBeNull();
      expect(cleanText("   \t  \n ")).toBeNull();
    });

    it("cleans zero width characters and strips control characters", () => {
      const input = "Hello\u200B World\u0000!";
      expect(cleanText(input)).toBe("Hello World!");
    });

    it("preserves paragraphs while collapsing excessive newlines", () => {
      const input = "Paragraph 1\n\n\n\nParagraph 2";
      expect(cleanText(input)).toBe("Paragraph 1\n\nParagraph 2");
    });

    it("converts numbers and booleans to string", () => {
      expect(cleanText(123)).toBe("123");
      expect(cleanText(true)).toBe("true");
    });
  });

  describe("cleanSingleLine", () => {
    it("collapses multi-line strings into a single line", () => {
      const input = "Line 1\n  Line 2  \nLine 3";
      expect(cleanSingleLine(input)).toBe("Line 1 Line 2 Line 3");
    });

    it("returns null for blank input", () => {
      expect(cleanSingleLine("   \n\t ")).toBeNull();
    });
  });

  describe("normalizeKey & compactKey", () => {
    it("strips diacritics, punctuation, lowercases and normalizes whitespace", () => {
      expect(normalizeKey("  José's  Café!! ")).toBe("joses cafe");
      expect(compactKey("  José's  Café!! ")).toBe("josescafe");
    });


    it("handles empty or special input", () => {
      expect(normalizeKey(null)).toBe("");
      expect(compactKey("")).toBe("");
    });
  });

  describe("formula injection protection", () => {
    it("detects formula injection triggers", () => {
      expect(isFormulaInjectionRisk("=1+1")).toBe(true);
      expect(isFormulaInjectionRisk("+SUM(A1:A10)")).toBe(true);
      expect(isFormulaInjectionRisk("-100")).toBe(true);
      expect(isFormulaInjectionRisk("@cmd")).toBe(true);
      expect(isFormulaInjectionRisk("  =2+2")).toBe(true);
      expect(isFormulaInjectionRisk("Normal text")).toBe(false);
    });

    it("neutralizes formula values with a single quote prefix", () => {
      expect(neutralizeFormulaValue("=SUM(A1:B1)")).toBe("'=SUM(A1:B1)");
      expect(neutralizeFormulaValue("Safe text")).toBe("Safe text");
    });
  });

  describe("URL & HTML helpers", () => {
    it("validates safe HTTP/HTTPS URLs", () => {
      expect(isSafeHttpUrl("https://example.com")).toBe(true);
      expect(isSafeHttpUrl("http://localhost:3000")).toBe(true);
      expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeHttpUrl("data:text/html,abc")).toBe(false);
      expect(isSafeHttpUrl("not a url")).toBe(false);
      expect(isSafeHttpUrl(null)).toBe(false);
    });

    it("strips HTML tags", () => {
      expect(stripTags("<p>Hello <b>World</b></p>")).toBe("Hello World");
    });

    it("creates short signature", () => {
      expect(shortSignature(["John", "Doe", null, "Author"])).toBe("john | doe | author");
    });
  });
});
