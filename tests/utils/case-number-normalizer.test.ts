/**
 * Tests for Case Number Normalizer utility
 */

import { describe, it, expect } from "vitest";
import {
  normalizeCaseId,
  extractDigits,
  isServiceNowNumber,
  findMatchingCaseNumber,
} from "../../lib/utils/case-number-normalizer";

describe("Case Number Normalizer", () => {
  describe("normalizeCaseId", () => {
    it("should normalize bare 5-digit numbers with SCS prefix", () => {
      expect(normalizeCaseId("SCS", "46363")).toBe("SCS0046363");
    });

    it("should normalize bare 5-digit numbers with INC prefix", () => {
      expect(normalizeCaseId("INC", "16758")).toBe("INC0016758");
    });

    it("should normalize bare 6-digit numbers", () => {
      expect(normalizeCaseId("SCS", "123456")).toBe("SCS0123456");
    });

    it("should not pad 7-digit numbers", () => {
      expect(normalizeCaseId("SCS", "1234567")).toBe("SCS1234567");
    });

    it("should truncate numbers longer than 7 digits (take rightmost)", () => {
      expect(normalizeCaseId("SCS", "12345678")).toBe("SCS2345678");
      expect(normalizeCaseId("INC", "987654321")).toBe("INC7654321");
    });

    it("should handle CS prefix", () => {
      expect(normalizeCaseId("CS", "46363")).toBe("CS0046363");
    });

    it("should strip non-numeric characters from input", () => {
      expect(normalizeCaseId("SCS", "CS46363")).toBe("SCS0046363");
      expect(normalizeCaseId("INC", "INC-167587")).toBe("INC0167587");
    });

    it("should normalize when digits passed as number", () => {
      expect(normalizeCaseId("SCS", 46363)).toBe("SCS0046363");
      expect(normalizeCaseId("INC", 167587)).toBe("INC0167587");
    });

    it("should return empty string for non-numeric input", () => {
      expect(normalizeCaseId("SCS", "abc")).toBe("");
      expect(normalizeCaseId("INC", "")).toBe("");
    });

    it("should support custom totalDigits parameter", () => {
      expect(normalizeCaseId("REQ", "123", 5)).toBe("REQ00123");
      expect(normalizeCaseId("RITM", "9999", 6)).toBe("RITM009999");
    });
  });

  describe("extractDigits", () => {
    it("should extract digits from fully formatted case numbers", () => {
      expect(extractDigits("SCS0046363")).toBe("0046363");
      expect(extractDigits("INC0167587")).toBe("0167587");
      expect(extractDigits("CS0012345")).toBe("0012345");
    });

    it("should extract digits from bare numbers", () => {
      expect(extractDigits("46363")).toBe("46363");
      expect(extractDigits("167587")).toBe("167587");
    });

    it("should extract digits from partial formats", () => {
      expect(extractDigits("CS46363")).toBe("46363");
      expect(extractDigits("SCS123456")).toBe("123456");
    });

    it("should return empty string for non-numeric input", () => {
      expect(extractDigits("abc")).toBe("");
      expect(extractDigits("")).toBe("");
    });
  });

  describe("isServiceNowNumber", () => {
    it("should detect valid fully formatted numbers", () => {
      expect(isServiceNowNumber("SCS0046363")).toBe(true);
      expect(isServiceNowNumber("INC0167587")).toBe(true);
      expect(isServiceNowNumber("CS0012345")).toBe(true);
    });

    it("should detect valid partial formats", () => {
      expect(isServiceNowNumber("CS46363")).toBe(true);
      expect(isServiceNowNumber("SCS123456")).toBe(true);
      expect(isServiceNowNumber("INC167587")).toBe(true);
    });

    it("should detect bare 5-7 digit numbers", () => {
      expect(isServiceNowNumber("46363")).toBe(true);
      expect(isServiceNowNumber("123456")).toBe(true);
      expect(isServiceNowNumber("1234567")).toBe(true);
    });

    it("should reject invalid formats", () => {
      expect(isServiceNowNumber("abc")).toBe(false);
      expect(isServiceNowNumber("1234")).toBe(false); // too short
      expect(isServiceNowNumber("12345678")).toBe(false); // too long
      expect(isServiceNowNumber("")).toBe(false);
    });

    it("should be case-insensitive for prefixes", () => {
      expect(isServiceNowNumber("scs0046363")).toBe(true);
      expect(isServiceNowNumber("inc0167587")).toBe(true);
      expect(isServiceNowNumber("CS46363")).toBe(true);
    });
  });

  describe("findMatchingCaseNumber", () => {
    const canonicalCases = ["SCS0046363", "INC0167587", "CS0012345"];

    it("should find match with bare number", () => {
      expect(findMatchingCaseNumber("46363", canonicalCases)).toBe("SCS0046363");
      expect(findMatchingCaseNumber("167587", canonicalCases)).toBe("INC0167587");
      expect(findMatchingCaseNumber("12345", canonicalCases)).toBe("CS0012345");
    });

    it("should find match when raw number provided as numeric type", () => {
      expect(findMatchingCaseNumber(46363, canonicalCases)).toBe("SCS0046363");
    });

    it("should find match with partial format", () => {
      expect(findMatchingCaseNumber("SCS46363", canonicalCases)).toBe("SCS0046363");
      expect(findMatchingCaseNumber("INC167587", canonicalCases)).toBe("INC0167587");
    });

    it("should find match with different prefix", () => {
      // "46363" in input should match "SCS0046363" even though prefixes differ
      expect(findMatchingCaseNumber("INC46363", canonicalCases)).toBe("SCS0046363");
    });

    it("should find match with fully formatted number", () => {
      expect(findMatchingCaseNumber("SCS0046363", canonicalCases)).toBe("SCS0046363");
    });

    it("should return null when no match found", () => {
      expect(findMatchingCaseNumber("99999", canonicalCases)).toBe(null);
      expect(findMatchingCaseNumber("888888", canonicalCases)).toBe(null);
    });

    it("should return null for empty inputs", () => {
      expect(findMatchingCaseNumber("", canonicalCases)).toBe(null);
      expect(findMatchingCaseNumber("46363", [])).toBe(null);
    });

    it("should return null for non-numeric input", () => {
      expect(findMatchingCaseNumber("abc", canonicalCases)).toBe(null);
    });

    it("should handle padded vs unpadded digit matching", () => {
      const cases = ["SCS0046363"];
      expect(findMatchingCaseNumber("046363", cases)).toBe("SCS0046363");
      expect(findMatchingCaseNumber("46363", cases)).toBe("SCS0046363");
    });
  });
});
