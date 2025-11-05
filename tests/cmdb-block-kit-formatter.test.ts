/**
 * CMDB Block Kit Formatter Tests
 *
 * Tests for CI Block Kit formatting including:
 * - Basic CI card generation
 * - Status and environment emoji mapping
 * - Relationship display
 * - ServiceNow deep links
 */

import { describe, it, expect } from "vitest";
import {
  formatCIAsBlockKit,
  generateCIFallbackText,
} from "../lib/formatters/servicenow-block-kit";

describe("CMDB Block Kit Formatter", () => {
  describe("Basic CI Card Generation", () => {
    it("should generate complete Block Kit for CI with all fields", () => {
      const ci = {
        sys_id: "ci-123",
        name: "PROD-WEB-01",
        sys_class_name: "cmdb_ci_server",
        fqdn: "prod-web-01.example.com",
        host_name: "prod-web-01",
        ip_addresses: ["10.0.1.10", "192.168.1.10"],
        owner_group: "Platform Team",
        support_group: "Infrastructure Support",
        location: "Chicago Datacenter",
        environment: "production",
        status: "1",
        description: "Production web server for customer portal",
        url: "https://test.service-now.com/cmdb_ci.do?sys_id=ci-123",
      };

      const blocks = formatCIAsBlockKit(ci);

      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);

      // Verify header
      const header = blocks.find((b) => b.type === "header");
      expect(header).toBeDefined();
      expect(header.text.text).toContain("PROD-WEB-01");

      // Verify type section
      const typeSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("cmdb_ci_server")
      );
      expect(typeSection).toBeDefined();

      // Verify status fields section
      const statusSection = blocks.find(
        (b) => b.type === "section" && b.fields
      );
      expect(statusSection).toBeDefined();
      expect(statusSection.fields).toHaveLength(4); // Status, Environment, Owner, Location

      // Verify action button
      const actions = blocks.find((b) => b.type === "actions");
      expect(actions).toBeDefined();
      expect(actions.elements[0].url).toBe(ci.url);
    });

    it("should handle minimal CI data gracefully", () => {
      const ci = {
        sys_id: "ci-minimal",
        name: "MINIMAL-CI",
        ip_addresses: [],
      };

      const blocks = formatCIAsBlockKit(ci);

      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);

      const header = blocks.find((b) => b.type === "header");
      expect(header.text.text).toBe("MINIMAL-CI");
    });

    it("should include technical details when available", () => {
      const ci = {
        sys_id: "ci-tech",
        name: "SERVER-01",
        ip_addresses: ["10.0.1.10"],
        fqdn: "server-01.example.com",
        host_name: "server-01",
        support_group: "24/7 Support",
      };

      const blocks = formatCIAsBlockKit(ci);

      // Find technical details section
      const techSection = blocks.find(
        (b) =>
          b.type === "section" &&
          b.fields &&
          b.fields.some((f: any) => f.text?.includes("FQDN") || f.text?.includes("IP Addresses"))
      );

      expect(techSection).toBeDefined();
    });
  });

  describe("Status and Environment Emoji Mapping", () => {
    it("should show ✅ for operational status", () => {
      const ci = {
        sys_id: "ci-1",
        name: "OPERATIONAL-CI",
        ip_addresses: [],
        status: "1", // Operational
      };

      const blocks = formatCIAsBlockKit(ci);

      const statusField = blocks
        .filter((b) => b.type === "section" && b.fields)
        .flatMap((b) => b.fields)
        .find((f: any) => f.text?.includes("Status"));

      expect(statusField.text).toContain("✅");
    });

    it("should show ❌ for non-operational status", () => {
      const ci = {
        sys_id: "ci-2",
        name: "DOWN-CI",
        ip_addresses: [],
        status: "2", // Non-operational
      };

      const blocks = formatCIAsBlockKit(ci);

      const statusField = blocks
        .filter((b) => b.type === "section" && b.fields)
        .flatMap((b) => b.fields)
        .find((f: any) => f.text?.includes("Status"));

      expect(statusField.text).toContain("❌");
    });

    it("should show 🔴 for production environment", () => {
      const ci = {
        sys_id: "ci-3",
        name: "PROD-CI",
        ip_addresses: [],
        environment: "production",
      };

      const blocks = formatCIAsBlockKit(ci);

      const envField = blocks
        .filter((b) => b.type === "section" && b.fields)
        .flatMap((b) => b.fields)
        .find((f: any) => f.text?.includes("Environment"));

      expect(envField.text).toContain("🔴");
      expect(envField.text).toContain("production");
    });

    it("should show 🟢 for development environment", () => {
      const ci = {
        sys_id: "ci-4",
        name: "DEV-CI",
        ip_addresses: [],
        environment: "development",
      };

      const blocks = formatCIAsBlockKit(ci);

      const envField = blocks
        .filter((b) => b.type === "section" && b.fields)
        .flatMap((b) => b.fields)
        .find((f: any) => f.text?.includes("Environment"));

      expect(envField.text).toContain("🟢");
    });
  });

  describe("Relationship Display", () => {
    it("should display related CIs when includeRelationships is true", () => {
      const ci = {
        sys_id: "ci-main",
        name: "MAIN-CI",
        ip_addresses: [],
      };

      const relatedCIs = [
        {
          sys_id: "ci-rel-1",
          name: "RELATED-CI-1",
          sys_class_name: "cmdb_ci_database",
          ip_addresses: [],
        },
        {
          sys_id: "ci-rel-2",
          name: "RELATED-CI-2",
          sys_class_name: "cmdb_ci_app_server",
          ip_addresses: [],
        },
      ];

      const blocks = formatCIAsBlockKit(ci, {
        includeRelationships: true,
        relatedCIs,
      });

      const relSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Related CIs")
      );

      expect(relSection).toBeDefined();
      expect(relSection.text.text).toContain("RELATED-CI-1");
      expect(relSection.text.text).toContain("RELATED-CI-2");
      expect(relSection.text.text).toContain("(2)"); // Count
    });

    it("should not display relationships when includeRelationships is false", () => {
      const ci = {
        sys_id: "ci-main",
        name: "MAIN-CI",
        ip_addresses: [],
      };

      const relatedCIs = [
        {
          sys_id: "ci-rel-1",
          name: "RELATED-CI-1",
          ip_addresses: [],
        },
      ];

      const blocks = formatCIAsBlockKit(ci, {
        includeRelationships: false,
        relatedCIs,
      });

      const relSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Related CIs")
      );

      expect(relSection).toBeUndefined();
    });

    it("should limit displayed relationships to maxRelatedCIs", () => {
      const ci = {
        sys_id: "ci-main",
        name: "MAIN-CI",
        ip_addresses: [],
      };

      const relatedCIs = Array.from({ length: 10 }, (_, i) => ({
        sys_id: `ci-rel-${i}`,
        name: `RELATED-CI-${i}`,
        ip_addresses: [],
      }));

      const blocks = formatCIAsBlockKit(ci, {
        includeRelationships: true,
        relatedCIs,
        maxRelatedCIs: 3,
      });

      const relSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Related CIs")
      );

      expect(relSection.text.text).toContain("RELATED-CI-0");
      expect(relSection.text.text).toContain("RELATED-CI-1");
      expect(relSection.text.text).toContain("RELATED-CI-2");
      expect(relSection.text.text).toContain("...and 7 more"); // Footer
    });

    it("should show default 5 relationships when maxRelatedCIs not specified", () => {
      const ci = {
        sys_id: "ci-main",
        name: "MAIN-CI",
        ip_addresses: [],
      };

      const relatedCIs = Array.from({ length: 8 }, (_, i) => ({
        sys_id: `ci-rel-${i}`,
        name: `RELATED-CI-${i}`,
        ip_addresses: [],
      }));

      const blocks = formatCIAsBlockKit(ci, {
        includeRelationships: true,
        relatedCIs,
      });

      const relSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Related CIs")
      );

      // Should show 5 CIs + "...and 3 more"
      expect(relSection.text.text).toContain("RELATED-CI-4");
      expect(relSection.text.text).toContain("...and 3 more");
    });
  });

  describe("ServiceNow Deep Links", () => {
    it("should use provided URL when available", () => {
      const ci = {
        sys_id: "ci-123",
        name: "TEST-CI",
        ip_addresses: [],
        url: "https://custom.service-now.com/cmdb_ci.do?sys_id=ci-123",
      };

      const blocks = formatCIAsBlockKit(ci);

      const actions = blocks.find((b) => b.type === "actions");
      expect(actions.elements[0].url).toBe(ci.url);
    });

    it("should generate fallback URL when not provided", () => {
      const ci = {
        sys_id: "ci-456",
        name: "TEST-CI",
        ip_addresses: [],
      };

      const blocks = formatCIAsBlockKit(ci);

      const actions = blocks.find((b) => b.type === "actions");
      expect(actions.elements[0].url).toContain("cmdb");
      expect(actions.elements[0].url).toContain("ci-456"); // sys_id in URL
    });
  });

  describe("Description Handling", () => {
    it("should include description when provided", () => {
      const ci = {
        sys_id: "ci-1",
        name: "CI-WITH-DESC",
        ip_addresses: [],
        description: "This is a production web server handling customer traffic",
      };

      const blocks = formatCIAsBlockKit(ci);

      const descSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Description")
      );

      expect(descSection).toBeDefined();
      expect(descSection.text.text).toContain("production web server");
    });

    it("should truncate long descriptions", () => {
      const longDesc = "A".repeat(500);

      const ci = {
        sys_id: "ci-2",
        name: "CI-LONG-DESC",
        ip_addresses: [],
        description: longDesc,
      };

      const blocks = formatCIAsBlockKit(ci);

      const descSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Description")
      );

      expect(descSection.text.text.length).toBeLessThan(350); // Should be truncated
      expect(descSection.text.text).toContain("...");
    });

    it("should omit description section when not provided", () => {
      const ci = {
        sys_id: "ci-3",
        name: "CI-NO-DESC",
        ip_addresses: [],
      };

      const blocks = formatCIAsBlockKit(ci);

      const descSection = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Description")
      );

      expect(descSection).toBeUndefined();
    });
  });

  describe("Fallback Text Generation", () => {
    it("should generate concise fallback text", () => {
      const ci = {
        sys_id: "ci-1",
        name: "PROD-WEB-01",
        sys_class_name: "cmdb_ci_server",
        status: "1",
        environment: "production",
        ip_addresses: [],
      };

      const fallback = generateCIFallbackText(ci);

      expect(fallback).toContain("PROD-WEB-01");
      expect(fallback).toContain("cmdb_ci_server");
      expect(fallback).toContain("production");
    });

    it("should handle minimal CI data in fallback", () => {
      const ci = {
        sys_id: "ci-2",
        name: "MINIMAL-CI",
        ip_addresses: [],
      };

      const fallback = generateCIFallbackText(ci);

      expect(fallback).toContain("MINIMAL-CI");
      expect(fallback).not.toContain("undefined");
      expect(fallback).not.toContain("null");
    });

    it("should format fallback for notifications", () => {
      const ci = {
        sys_id: "ci-3",
        name: "ALERT-CI",
        sys_class_name: "cmdb_ci_server",
        status: "2", // Non-operational
        environment: "production",
        ip_addresses: [],
      };

      const fallback = generateCIFallbackText(ci);

      // Should be readable in notification context
      expect(fallback).toMatch(/CI: .+ \| Type: .+ \| Status: .+/);
    });
  });

  describe("Block Kit Structure Validation", () => {
    it("should include required block types", () => {
      const ci = {
        sys_id: "ci-1",
        name: "TEST-CI",
        ip_addresses: [],
      };

      const blocks = formatCIAsBlockKit(ci);

      const blockTypes = blocks.map((b) => b.type);

      expect(blockTypes).toContain("header");
      expect(blockTypes).toContain("section");
      expect(blockTypes).toContain("divider");
      expect(blockTypes).toContain("actions");
    });

    it("should not exceed Slack block limit", () => {
      const ci = {
        sys_id: "ci-complex",
        name: "COMPLEX-CI",
        ip_addresses: ["10.0.1.1", "10.0.1.2"],
        fqdn: "complex.example.com",
        host_name: "complex",
        description: "Complex CI with lots of data",
        owner_group: "Team A",
        support_group: "Team B",
        location: "Location",
        environment: "production",
        status: "1",
      };

      const relatedCIs = Array.from({ length: 20 }, (_, i) => ({
        sys_id: `ci-${i}`,
        name: `RELATED-${i}`,
        ip_addresses: [],
      }));

      const blocks = formatCIAsBlockKit(ci, {
        includeRelationships: true,
        relatedCIs,
      });

      // Slack has a limit of 50 blocks per message
      expect(blocks.length).toBeLessThanOrEqual(50);
    });

    it("should have proper mrkdwn formatting in text fields", () => {
      const ci = {
        sys_id: "ci-1",
        name: "FORMAT-TEST",
        ip_addresses: [],
        status: "1",
      };

      const blocks = formatCIAsBlockKit(ci);

      const sections = blocks.filter((b) => b.type === "section");

      sections.forEach((section) => {
        if (section.text?.type) {
          expect(section.text.type).toBe("mrkdwn");
        }
        if (section.fields) {
          section.fields.forEach((field: any) => {
            if (field.type) {
              expect(field.type).toBe("mrkdwn");
            }
          });
        }
      });
    });
  });
});
