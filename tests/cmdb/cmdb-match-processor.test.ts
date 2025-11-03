import { describe, it, expect, vi, beforeEach } from "vitest";
import { CmdbMatchProcessor } from "../../lib/services/cmdb/cmdb-match-processor";
import type { ServiceNowConfigurationItem } from "../../lib/tools/servicenow";

describe("CmdbMatchProcessor", () => {
  let processor: CmdbMatchProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new CmdbMatchProcessor();
  });

  describe("processMatches", () => {
    it("should return create_task action when no matches found", async () => {
      const matches: ServiceNowConfigurationItem[] = [];
      
      const result = await processor.processMatches(matches, "missing-server", "SYSTEM");

      expect(result).toEqual({
        action: 'create_task',
        confidence: 0.0,
        details: 'No CMDB match found for SYSTEM: missing-server',
      });
    });

    it("should return link_ci action when exactly one match found", async () => {
      const matches: ServiceNowConfigurationItem[] = [{
        sys_id: "ci_123",
        name: "server01",
        sys_class_name: "cmdb_ci_server",
        url: "http://servicenow.com/ci_123",
        ip_addresses: ["192.168.1.100"],
      }];
      
      const result = await processor.processMatches(matches, "server01", "SYSTEM");

      expect(result.action).toBe('link_ci');
      expect(result.match).toEqual(matches[0]);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.details).toContain('Exact match found: server01');
    });

    it("should return ambiguous action when multiple matches found", async () => {
      const matches: ServiceNowConfigurationItem[] = [
        { sys_id: "ci_1", name: "server01-prod", sys_class_name: "cmdb_ci_server", ip_addresses: [], url: "" },
        { sys_id: "ci_2", name: "server01-test", sys_class_name: "cmdb_ci_server", ip_addresses: [], url: "" },
        { sys_id: "ci_3", name: "server01-dev", sys_class_name: "cmdb_ci_server", ip_addresses: [], url: "" },
      ];
      
      const result = await processor.processMatches(matches, "server01", "SYSTEM");

      expect(result).toEqual({
        action: 'ambiguous',
        confidence: 0.3,
        details: 'Found 3 matches for SYSTEM: server01: server01-prod, server01-test, server01-dev',
      });
    });

    it("should calculate higher confidence for exact name matches", async () => {
      const exactMatch: ServiceNowConfigurationItem = {
        sys_id: "ci_123",
        name: "server01",
        sys_class_name: "cmdb_ci_server",
        url: "http://servicenow.com/ci_123",
        ip_addresses: [],
      };
      
      const result = await processor.processMatches([exactMatch], "server01", "SYSTEM");

      expect(result.confidence).toBeGreaterThan(0.7); // Base 0.5 + exact match 0.3
    });

    it("should calculate higher confidence for relevant CI classes", async () => {
      const serverMatch: ServiceNowConfigurationItem = {
        sys_id: "ci_123",
        name: "server01",
        sys_class_name: "cmdb_ci_server", // Relevant for SYSTEM
        url: "http://servicenow.com/ci_123",
        ip_addresses: [],
      };
      
      const result = await processor.processMatches([serverMatch], "server01", "SYSTEM");

      expect(result.confidence).toBeGreaterThan(0.8); // Should include relevant class bonus
    });

    it("should calculate higher confidence for IP address matches", async () => {
      const ipMatch: ServiceNowConfigurationItem = {
        sys_id: "ci_456",
        name: "Network Interface",
        sys_class_name: "cmdb_ci_ip_address",
        ip_addresses: ["192.168.1.100", "192.168.1.1"],
        url: "http://servicenow.com/ci_456",
      };
      
      const result = await processor.processMatches([ipMatch], "192.168.1.1", "IP_ADDRESS");

      expect(result.confidence).toBeGreaterThan(0.8); // Should include IP match bonus
    });

    it("should handle partial name matches", async () => {
      const partialMatch: ServiceNowConfigurationItem = {
        sys_id: "ci_789",
        name: "server01-prod",
        sys_class_name: "cmdb_ci_server",
        url: "http://servicenow.com/ci_789",
        ip_addresses: [],
      };
      
      const result = await processor.processMatches([partialMatch], "server01", "SYSTEM");

      expect(result.action).toBe('link_ci');
      expect(result.confidence).toBeGreaterThan(0.5); // Base + partial match bonus
      expect(result.confidence).toBeLessThan(0.8); // Less than exact match
    });
  });

  describe("shouldContinueProcessing", () => {
    it("should return true for non-skip actions", () => {
      expect(processor.shouldContinueProcessing({ action: 'link_ci', confidence: 0.9 })).toBe(true);
      expect(processor.shouldContinueProcessing({ action: 'create_task', confidence: 0.0 })).toBe(true);
      expect(processor.shouldContinueProcessing({ action: 'ambiguous', confidence: 0.3 })).toBe(true);
    });

    it("should return false for skip action", () => {
      expect(processor.shouldContinueProcessing({ action: 'skip', confidence: 0.0 })).toBe(false);
    });
  });

  describe("validateMatchResult", () => {
    it("should validate correct match results", () => {
      const validResult = {
        action: 'link_ci' as const,
        match: { sys_id: "ci_123", name: "server01", ip_addresses: [], url: "" },
        confidence: 0.9,
        details: "Exact match found",
      };

      expect(processor.validateMatchResult(validResult)).toBe(true);
    });

    it("should reject results with invalid actions", () => {
      const invalidResult = {
        action: 'invalid_action' as any,
        confidence: 0.5,
      };

      expect(processor.validateMatchResult(invalidResult)).toBe(false);
    });

    it("should reject link_ci results without matches", () => {
      const invalidResult = {
        action: 'link_ci' as const,
        confidence: 0.9,
        // Missing match property
      };

      expect(processor.validateMatchResult(invalidResult)).toBe(false);
    });

    it("should reject results with invalid confidence scores", () => {
      const invalidResult1 = {
        action: 'create_task' as const,
        confidence: -0.1, // Too low
      };

      const invalidResult2 = {
        action: 'create_task' as const,
        confidence: 1.1, // Too high
      };

      expect(processor.validateMatchResult(invalidResult1)).toBe(false);
      expect(processor.validateMatchResult(invalidResult2)).toBe(false);
    });
  });
});