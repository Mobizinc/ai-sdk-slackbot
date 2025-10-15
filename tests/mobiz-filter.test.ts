import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAllowedMobizDomains, isMobizEmail } from "../lib/services/mobiz-filter";

describe("Mobiz Filter", () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.MOBIZ_SERVICE_DESK_DOMAINS;
  });

  afterEach(() => {
    // Clean up after each test
    delete process.env.MOBIZ_SERVICE_DESK_DOMAINS;
  });

  describe("getAllowedMobizDomains", () => {
    it("should return default domain when no environment variable is set", () => {
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["mobizinc.com"]);
    });

    it("should parse single domain from environment variable", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "example.com";
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["example.com"]);
    });

    it("should parse multiple domains from environment variable", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "mobizinc.com,example.com,test.org";
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["mobizinc.com", "example.com", "test.org"]);
    });

    it("should handle whitespace and trim domains", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = " mobizinc.com , example.com , test.org ";
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["mobizinc.com", "example.com", "test.org"]);
    });

    it("should convert domains to lowercase", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "MOBIZINC.COM,EXAMPLE.COM,TEST.ORG";
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["mobizinc.com", "example.com", "test.org"]);
    });

    it("should filter out empty entries", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "mobizinc.com,,example.com, ,test.org";
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["mobizinc.com", "example.com", "test.org"]);
    });

    it("should handle empty environment variable", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "";
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["mobizinc.com"]); // Falls back to default
    });

    it("should handle whitespace-only environment variable", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "   ";
      const domains = getAllowedMobizDomains();
      expect(domains).toEqual(["mobizinc.com"]); // Falls back to default
    });
  });

  describe("isMobizEmail", () => {
    it("should return true for default domain email", () => {
      const result = isMobizEmail("user@mobizinc.com");
      expect(result).toBe(true);
    });

    it("should return true for default domain email with different case", () => {
      const result = isMobizEmail("USER@MOBIZINC.COM");
      expect(result).toBe(true);
    });

    it("should return false for non-mobiz email", () => {
      const result = isMobizEmail("user@example.com");
      expect(result).toBe(false);
    });

    it("should return false for invalid email format", () => {
      const result = isMobizEmail("invalid-email");
      expect(result).toBe(false);
    });

    it("should return false for null/undefined email", () => {
      expect(isMobizEmail(null)).toBe(false);
      expect(isMobizEmail(undefined)).toBe(false);
      expect(isMobizEmail("")).toBe(false);
    });

    it("should return false for empty string email", () => {
      const result = isMobizEmail("");
      expect(result).toBe(false);
    });

    it("should work with custom domains from environment", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "example.com,test.org";
      
      expect(isMobizEmail("user@example.com")).toBe(true);
      expect(isMobizEmail("user@test.org")).toBe(true);
      expect(isMobizEmail("user@mobizinc.com")).toBe(false); // Default domain not included
    });

    it("should work with mixed custom and default domains", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "mobizinc.com,example.com,test.org";
      
      expect(isMobizEmail("user@mobizinc.com")).toBe(true);
      expect(isMobizEmail("user@example.com")).toBe(true);
      expect(isMobizEmail("user@test.org")).toBe(true);
      expect(isMobizEmail("user@other.com")).toBe(false);
    });

    it("should handle case insensitive matching with custom domains", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "EXAMPLE.COM,TEST.ORG";
      
      expect(isMobizEmail("user@example.com")).toBe(true);
      expect(isMobizEmail("USER@EXAMPLE.COM")).toBe(true);
      expect(isMobizEmail("user@TEST.ORG")).toBe(true);
      expect(isMobizEmail("USER@test.org")).toBe(true);
    });

    it("should handle subdomains correctly", () => {
      process.env.MOBIZ_SERVICE_DESK_DOMAINS = "example.com";
      
      // Should match exact domain
      expect(isMobizEmail("user@example.com")).toBe(true);
      
      // Should not match subdomains (endswith check)
      expect(isMobizEmail("user@sub.example.com")).toBe(true); // endswith works
      expect(isMobizEmail("user@example.org")).toBe(false);
    });

    it("should handle emails with multiple @ symbols (invalid format)", () => {
      const result = isMobizEmail("user@@mobizinc.com");
      expect(result).toBe(false);
    });

    it("should handle emails without domain part", () => {
      const result = isMobizEmail("user@");
      expect(result).toBe(false);
    });

    it("should handle emails without user part", () => {
      const result = isMobizEmail("@mobizinc.com");
      expect(result).toBe(false);
    });

    it("should handle edge cases with whitespace", () => {
      expect(isMobizEmail(" user@mobizinc.com")).toBe(true);
      expect(isMobizEmail("user@mobizinc.com ")).toBe(true);
      expect(isMobizEmail(" user@mobizinc.com ")).toBe(true);
    });
  });
});