/**
 * CMDB Integration Tests
 *
 * End-to-end tests for CMDB functionality including:
 * - Natural language query processing
 * - Search + relationship traversal workflows
 * - Block Kit rendering
 * - ServiceNow tool integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatConfigurationItemsForLLM } from "../lib/services/servicenow-formatters";
import type { ServiceNowConfigurationItem } from "../lib/tools/servicenow";

describe("CMDB Integration Tests", () => {
  describe("Natural Language Query Workflows", () => {
    it("should handle: 'Show me production servers'", () => {
      // Simulates LLM extracting: environment='production', className='cmdb_ci_server'
      const mockCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-1",
          name: "PROD-WEB-01",
          sys_class_name: "cmdb_ci_server",
          fqdn: "prod-web-01.example.com",
          host_name: "prod-web-01",
          ip_addresses: ["10.0.1.10"],
          owner_group: "Platform Team",
          support_group: "Infrastructure",
          location: "Chicago DC",
          environment: "production",
          status: "1",
          description: "Production web server",
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-1",
        },
        {
          sys_id: "ci-2",
          name: "PROD-APP-01",
          sys_class_name: "cmdb_ci_server",
          fqdn: "prod-app-01.example.com",
          host_name: "prod-app-01",
          ip_addresses: ["10.0.1.20"],
          environment: "production",
          status: "1",
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-2",
        },
      ];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted).toBeDefined();
      expect(formatted?.summary).toContain("Found 2 configuration items");
      expect(formatted?.summary).toContain("PROD-WEB-01");
      expect(formatted?.summary).toContain("PROD-APP-01");
      expect(formatted?.summary).toContain("production");
    });

    it("should handle: 'CIs in Chicago datacenter'", () => {
      // Simulates LLM extracting: location='Chicago'
      const mockCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-1",
          name: "CHI-SERVER-01",
          sys_class_name: "cmdb_ci_server",
          ip_addresses: ["10.50.1.10"],
          location: "Chicago Datacenter",
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-1",
        },
        {
          sys_id: "ci-2",
          name: "CHI-SWITCH-01",
          sys_class_name: "cmdb_ci_netgear",
          ip_addresses: ["10.50.1.1"],
          location: "Chicago - Network Room",
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-2",
        },
      ];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      // Location is in raw data but not displayed in summary
      expect(formatted?.rawData).toHaveLength(2);
      expect(formatted?.summary).toContain("CHI-SERVER-01");
      expect(formatted?.summary).toContain("CHI-SWITCH-01");
    });

    it("should handle: 'non-operational network devices'", () => {
      // Simulates LLM extracting: className='cmdb_ci_netgear', operationalStatus='2'
      const mockCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-1",
          name: "FAILED-SWITCH-01",
          sys_class_name: "cmdb_ci_netgear",
          ip_addresses: ["10.0.2.1"],
          status: "2", // Non-operational
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-1",
        },
      ];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted?.summary).toContain("Found 1 configuration item");
      expect(formatted?.summary).toContain("FAILED-SWITCH-01");
    });
  });

  describe("Search + Relationship Workflow", () => {
    it("should format CIs with relationships", () => {
      const mainCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-web",
          name: "PROD-WEB-01",
          sys_class_name: "cmdb_ci_server",
          ip_addresses: ["10.0.1.10"],
          environment: "production",
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-web",
        },
      ];

      const relatedCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-db",
          name: "PROD-DB-01",
          sys_class_name: "cmdb_ci_database",
          ip_addresses: ["10.0.1.20"],
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-db",
        },
        {
          sys_id: "ci-cache",
          name: "PROD-CACHE-01",
          sys_class_name: "cmdb_ci_app_server",
          ip_addresses: ["10.0.1.30"],
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-cache",
        },
      ];

      const relationshipsMap = new Map<string, ServiceNowConfigurationItem[]>();
      relationshipsMap.set("ci-web", relatedCIs);

      const formatted = formatConfigurationItemsForLLM(mainCIs, {
        includeRelationships: true,
        relationships: relationshipsMap,
      });

      expect(formatted).toBeDefined();
      expect(formatted?.summary).toContain("Relationships");
      expect(formatted?.summary).toContain("PROD-WEB-01");
      expect(formatted?.summary).toContain("PROD-DB-01");
      expect(formatted?.summary).toContain("PROD-CACHE-01");
    });

    it("should limit displayed relationships to 5 per CI", () => {
      const mainCI: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-lb",
          name: "PROD-LB-01",
          sys_class_name: "cmdb_ci_lb",
          ip_addresses: ["10.0.0.1"],
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-lb",
        },
      ];

      const relatedCIs: ServiceNowConfigurationItem[] = Array.from(
        { length: 10 },
        (_, i) => ({
          sys_id: `ci-web-${i}`,
          name: `PROD-WEB-${i.toString().padStart(2, "0")}`,
          sys_class_name: "cmdb_ci_server",
          ip_addresses: [`10.0.1.${10 + i}`],
          url: `https://test.service-now.com/cmdb_ci.do?sys_id=ci-web-${i}`,
        })
      );

      const relationshipsMap = new Map();
      relationshipsMap.set("ci-lb", relatedCIs);

      const formatted = formatConfigurationItemsForLLM(mainCI, {
        includeRelationships: true,
        relationships: relationshipsMap,
      });

      // Should show first 5 + "... and 5 more" (note spaces)
      expect(formatted?.summary).toContain("PROD-WEB-00");
      expect(formatted?.summary).toContain("PROD-WEB-04");
      expect(formatted?.summary).toContain("... and 5 more");
      expect(formatted?.summary).not.toContain("PROD-WEB-09");
    });
  });

  describe("Empty Result Handling", () => {
    it("should handle empty CI search results", () => {
      const mockCIs: ServiceNowConfigurationItem[] = [];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted).toBeDefined();
      expect(formatted?.summary).toContain("No configuration items found");
      expect(formatted?.rawData).toHaveLength(0);
    });

    it("should handle CIs with no relationships", () => {
      const mainCI: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-orphan",
          name: "ORPHAN-CI",
          sys_class_name: "cmdb_ci_server",
          ip_addresses: [],
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-orphan",
        },
      ];

      const relationshipsMap = new Map();
      relationshipsMap.set("ci-orphan", []); // No relationships

      const formatted = formatConfigurationItemsForLLM(mainCI, {
        includeRelationships: true,
        relationships: relationshipsMap,
      });

      // Should not include Relationships section
      expect(formatted?.summary).not.toContain("Relationships:");
      expect(formatted?.summary).toContain("ORPHAN-CI");
    });
  });

  describe("Large Dataset Handling", () => {
    it("should handle 50 CIs efficiently", () => {
      const mockCIs: ServiceNowConfigurationItem[] = Array.from(
        { length: 50 },
        (_, i) => ({
          sys_id: `ci-${i}`,
          name: `SERVER-${i.toString().padStart(3, "0")}`,
          sys_class_name: "cmdb_ci_server",
          ip_addresses: [`10.0.${Math.floor(i / 255)}.${i % 255}`],
          environment: i % 2 === 0 ? "production" : "development",
          url: `https://test.service-now.com/cmdb_ci.do?sys_id=ci-${i}`,
        })
      );

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted).toBeDefined();
      expect(formatted?.summary).toContain("Found 50 configuration items");
      expect(formatted?.summary).toContain("Showing top 10 of 50");
      expect(formatted?.rawData).toHaveLength(50);
    });

    it("should truncate display to 10 CIs but preserve all raw data", () => {
      const mockCIs: ServiceNowConfigurationItem[] = Array.from(
        { length: 25 },
        (_, i) => ({
          sys_id: `ci-${i}`,
          name: `CI-${i}`,
          sys_class_name: "cmdb_ci_server",
          ip_addresses: [],
          url: `https://test.service-now.com/cmdb_ci.do?sys_id=ci-${i}`,
        })
      );

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      // Summary should only show first 10
      const summaryLines = formatted?.summary.split("\n") || [];
      const ciLines = summaryLines.filter((line) => line.includes("CI-"));

      expect(ciLines.length).toBeLessThanOrEqual(10);

      // But raw data should have all 25
      expect(formatted?.rawData).toHaveLength(25);
    });
  });

  describe("Data Quality Scenarios", () => {
    it("should handle CIs with missing optional fields", () => {
      const mockCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-minimal",
          name: "MINIMAL-CI",
          ip_addresses: [],
          // Missing: class, environment, status, location, etc.
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-minimal",
        },
      ];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted).toBeDefined();
      expect(formatted?.summary).toContain("MINIMAL-CI");
      expect(formatted?.summary).not.toContain("undefined");
      expect(formatted?.summary).not.toContain("null");
    });

    it("should handle CIs with multiple IP addresses", () => {
      const mockCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-multi-ip",
          name: "MULTI-NIC-SERVER",
          sys_class_name: "cmdb_ci_server",
          ip_addresses: ["10.0.1.10", "192.168.1.10", "172.16.0.10"],
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-multi-ip",
        },
      ];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted?.summary).toContain("10.0.1.10");
      expect(formatted?.summary).toContain("192.168.1.10");
      expect(formatted?.summary).toContain("172.16.0.10");
    });

    it("should handle very long CI names gracefully", () => {
      const longName = "VERY-LONG-CONFIGURATION-ITEM-NAME-WITH-MANY-SEGMENTS-" + "A".repeat(50);

      const mockCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-long",
          name: longName,
          sys_class_name: "cmdb_ci_server",
          ip_addresses: [],
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-long",
        },
      ];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted).toBeDefined();
      expect(formatted?.summary).toContain(longName);
    });
  });

  describe("URL Generation", () => {
    it("should use provided URLs when available", () => {
      const mockCIs: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-1",
          name: "TEST-CI",
          ip_addresses: [],
          url: "https://custom.service-now.com/cmdb_ci.do?sys_id=ci-1",
        },
      ];

      const formatted = formatConfigurationItemsForLLM(mockCIs);

      expect(formatted?.rawData[0].url).toBe("https://custom.service-now.com/cmdb_ci.do?sys_id=ci-1");
    });
  });

  describe("Performance Characteristics", () => {
    it("should format 50 CIs in reasonable time", () => {
      const mockCIs: ServiceNowConfigurationItem[] = Array.from(
        { length: 50 },
        (_, i) => ({
          sys_id: `ci-${i}`,
          name: `CI-${i}`,
          sys_class_name: "cmdb_ci_server",
          ip_addresses: [`10.0.0.${i}`],
          environment: "production",
          status: "1",
          owner_group: "Team A",
          location: "DC1",
          url: `https://test.service-now.com/cmdb_ci.do?sys_id=ci-${i}`,
        })
      );

      const start = Date.now();
      const formatted = formatConfigurationItemsForLLM(mockCIs);
      const duration = Date.now() - start;

      expect(formatted).toBeDefined();
      expect(duration).toBeLessThan(100); // Should format in <100ms
    });

    it("should format complex relationships in reasonable time", () => {
      const mainCI: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci-main",
          name: "MAIN-CI",
          ip_addresses: [],
          url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-main",
        },
      ];

      const relatedCIs: ServiceNowConfigurationItem[] = Array.from(
        { length: 50 },
        (_, i) => ({
          sys_id: `ci-rel-${i}`,
          name: `RELATED-${i}`,
          sys_class_name: `type-${i % 5}`,
          ip_addresses: [],
          url: `https://test.service-now.com/cmdb_ci.do?sys_id=ci-rel-${i}`,
        })
      );

      const relationshipsMap = new Map();
      relationshipsMap.set("ci-main", relatedCIs);

      const start = Date.now();
      const formatted = formatConfigurationItemsForLLM(mainCI, {
        includeRelationships: true,
        relationships: relationshipsMap,
      });
      const duration = Date.now() - start;

      expect(formatted).toBeDefined();
      expect(duration).toBeLessThan(100); // Should format in <100ms
    });
  });
});
