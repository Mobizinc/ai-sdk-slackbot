/**
 * Unit Tests for Case Number Extractor
 */

import { describe, it, expect } from "vitest";
import {
  extractCaseNumbers,
  hasCaseNumbers,
  extractCaseNumbersWithPositions,
} from "../lib/utils/case-number-extractor";

describe("Case Number Extractor", () => {
  describe("extractCaseNumbers", () => {
    it("should extract SCS numbers", () => {
      const result = extractCaseNumbers("Please check SCS0001234 for details");

      expect(result).toEqual(["SCS0001234"]);
    });

    it("should extract INC numbers", () => {
      const result = extractCaseNumbers("Incident INC0005678 is urgent");

      expect(result).toEqual(["INC0005678"]);
    });

    it("should extract CASE numbers", () => {
      const result = extractCaseNumbers("Working on CASE0001234");

      expect(result).toEqual(["CASE0001234"]);
    });

    it("should extract RITM numbers", () => {
      const result = extractCaseNumbers("Request RITM0001234 was approved");

      expect(result).toEqual(["RITM0001234"]);
    });

    it("should extract multiple case numbers from same text", () => {
      const result = extractCaseNumbers(
        "SCS0001234 is related to INC0005678 and CASE0009999"
      );

      expect(result).toHaveLength(3);
      expect(result).toContain("SCS0001234");
      expect(result).toContain("INC0005678");
      expect(result).toContain("CASE0009999");
    });

    it("should normalize case numbers to uppercase", () => {
      const result = extractCaseNumbers("scs0001234 inc0005678");

      expect(result).toEqual(["SCS0001234", "INC0005678"]);
    });

    it("should deduplicate case numbers", () => {
      const result = extractCaseNumbers(
        "SCS0001234 is related to SCS0001234 again"
      );

      expect(result).toEqual(["SCS0001234"]);
    });

    it("should handle mixed case duplicates", () => {
      const result = extractCaseNumbers("SCS0001234 and scs0001234");

      expect(result).toEqual(["SCS0001234"]);
    });

    it("should return empty array for empty string", () => {
      const result = extractCaseNumbers("");

      expect(result).toEqual([]);
    });

    it("should return empty array for null/undefined input", () => {
      const result1 = extractCaseNumbers(null as any);
      const result2 = extractCaseNumbers(undefined as any);

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
    });

    it("should return empty array for text without case numbers", () => {
      const result = extractCaseNumbers(
        "This is just regular text without any cases"
      );

      expect(result).toEqual([]);
    });

    it("should not extract partial matches", () => {
      const result = extractCaseNumbers("SCS123 is too short");

      expect(result).toEqual([]);
    });

    it("should extract case numbers from URLs", () => {
      const result = extractCaseNumbers(
        "https://servicenow.com/SCS0001234?tab=notes"
      );

      expect(result).toEqual(["SCS0001234"]);
    });

    it("should handle case numbers with special characters around them", () => {
      const result = extractCaseNumbers(
        "(SCS0001234) [INC0005678] {CASE0009999}"
      );

      expect(result).toHaveLength(3);
      expect(result).toContain("SCS0001234");
      expect(result).toContain("INC0005678");
      expect(result).toContain("CASE0009999");
    });

    it("should extract case numbers from multiline text", () => {
      const result = extractCaseNumbers(`
        Line 1: SCS0001234
        Line 2: INC0005678
        Line 3: CASE0009999
      `);

      expect(result).toHaveLength(3);
    });

    it("should normalize shorthand case references like 'case 49764'", () => {
      const result = extractCaseNumbers("Can you check case 49764 for me?");

      expect(result).toEqual(["SCS0049764"]);
    });

    it("should normalize shorthand incident references like 'incident 167980'", () => {
      const result = extractCaseNumbers("Please review incident 167980 asap.");

      expect(result).toEqual(["INC0167980"]);
    });

    it("should handle prefixed references with spaces such as 'SCS 49764'", () => {
      const result = extractCaseNumbers("Status update on SCS 49764 please.");

      expect(result).toEqual(["SCS0049764"]);
    });
  });

  describe("hasCaseNumbers", () => {
    it("should return true when case numbers are present", () => {
      expect(hasCaseNumbers("Check SCS0001234")).toBe(true);
      expect(hasCaseNumbers("INC0005678 urgent")).toBe(true);
      expect(hasCaseNumbers("CASE0001234 resolved")).toBe(true);
    });

    it("should return false when no case numbers are present", () => {
      expect(hasCaseNumbers("No cases here")).toBe(false);
      expect(hasCaseNumbers("")).toBe(false);
      expect(hasCaseNumbers("SCS123 too short")).toBe(false);
    });

    it("should handle null/undefined input", () => {
      expect(hasCaseNumbers(null as any)).toBe(false);
      expect(hasCaseNumbers(undefined as any)).toBe(false);
    });
  });

  describe("extractCaseNumbersWithPositions", () => {
    it("should extract case numbers with positions", () => {
      const result = extractCaseNumbersWithPositions(
        "Check SCS0001234 for details"
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        caseNumber: "SCS0001234",
        startIndex: 6,
        endIndex: 16,
      });
    });

    it("should extract multiple case numbers with positions", () => {
      const result = extractCaseNumbersWithPositions(
        "SCS0001234 and INC0005678"
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        caseNumber: "SCS0001234",
        startIndex: 0,
        endIndex: 10,
      });
      expect(result[1]).toEqual({
        caseNumber: "INC0005678",
        startIndex: 15,
        endIndex: 25,
      });
    });

    it("should normalize case numbers to uppercase", () => {
      const result = extractCaseNumbersWithPositions("Check scs0001234");

      expect(result[0].caseNumber).toBe("SCS0001234");
    });

    it("should sort results by position", () => {
      const result = extractCaseNumbersWithPositions(
        "INC0005678 before SCS0001234"
      );

      expect(result[0].caseNumber).toBe("INC0005678");
      expect(result[1].caseNumber).toBe("SCS0001234");
    });

    it("should deduplicate same case number at same position", () => {
      // This is edge case - would happen if patterns overlap somehow
      const result = extractCaseNumbersWithPositions("SCS0001234");

      expect(result).toHaveLength(1);
    });

    it("should return empty array for empty string", () => {
      const result = extractCaseNumbersWithPositions("");

      expect(result).toEqual([]);
    });

    it("should return empty array for null/undefined input", () => {
      const result1 = extractCaseNumbersWithPositions(null as any);
      const result2 = extractCaseNumbersWithPositions(undefined as any);

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
    });

    it("should handle case numbers in complex text", () => {
      const text = "Please review SCS0001234, INC0005678, and CASE0009999.";
      const result = extractCaseNumbersWithPositions(text);

      expect(result).toHaveLength(3);
      expect(result[0].caseNumber).toBe("SCS0001234");
      expect(result[1].caseNumber).toBe("INC0005678");
      expect(result[2].caseNumber).toBe("CASE0009999");
    });

    it("should handle case numbers in URLs", () => {
      const text = "https://servicenow.com/SCS0001234";
      const result = extractCaseNumbersWithPositions(text);

      expect(result).toHaveLength(1);
      expect(result[0].caseNumber).toBe("SCS0001234");
      expect(result[0].startIndex).toBe(23);
    });

    it("should handle mixed case input", () => {
      const result = extractCaseNumbersWithPositions("scs0001234 SCS0001234");

      // Both should be extracted but deduplicated is tested separately
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].caseNumber).toBe("SCS0001234");
    });
  });
});
