/**
 * Unit Tests for ServiceNow Block Kit Formatter
 */

import { describe, it, expect } from "vitest";
import {
  formatCaseAsBlockKit,
  generateCaseFallbackText,
} from "../../lib/formatters/servicenow-block-kit";

describe("ServiceNow Block Kit Formatter", () => {
  describe("formatCaseAsBlockKit", () => {
    it("should format complete case with all fields", () => {
      const caseData = {
        number: "SCS0046363",
        sys_id: "abc123",
        short_description: "Email access issue",
        description: "User cannot access email after password reset.",
        state: "Work in Progress",
        priority: { display_value: "2 - High", value: "2" },
        assigned_to: { display_value: "John Smith", value: "user123" },
        assignment_group: "Service Desk",
        caller_id: "Jane Doe",
        company: "Acme Corp",
        category: "Email",
        subcategory: "Access",
        opened_at: "2025-10-28T10:00:00Z",
        updated_on: "2025-10-28T12:00:00Z",
      };

      const blocks = formatCaseAsBlockKit(caseData);

      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.length).toBeLessThanOrEqual(50); // Slack limit
      expect(blocks[0].type).toBe("header");
      expect(blocks[0].text.text).toContain("SCS0046363");

      // Verify short description block
      const descBlock = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Email access issue"),
      );
      expect(descBlock).toBeDefined();

      // Verify status fields block
      const statusBlock = blocks.find(
        (b) => b.type === "section" && b.fields && b.fields.length === 4,
      );
      expect(statusBlock).toBeDefined();
      expect(statusBlock.fields[0].text).toContain("Status");
      expect(statusBlock.fields[1].text).toContain("Priority");

      // Verify actions block exists
      const actionsBlock = blocks.find((b) => b.type === "actions");
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock.elements[0].text.text).toContain("Open in ServiceNow");
    });

    it("should handle null/undefined fields gracefully", () => {
      const caseData = {
        number: "SCS0000001",
        sys_id: null,
        short_description: undefined,
        assigned_to: null,
        assignment_group: undefined,
        state: null,
      };

      const blocks = formatCaseAsBlockKit(caseData as any);

      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);

      // Should show "Not provided" for missing fields
      const statusBlock = blocks.find((b) => b.type === "section" && b.fields);
      expect(statusBlock).toBeDefined();
      expect(JSON.stringify(statusBlock)).toContain("Not provided");
    });

    it("should handle object-style reference fields", () => {
      const caseData = {
        number: "SCS0000001",
        sys_id: { display_value: "display123", value: "value123" },
        assigned_to: { display_value: "John Smith", value: "user123" },
        state: { display_value: "Open", value: "1" },
      };

      const blocks = formatCaseAsBlockKit(caseData);

      expect(blocks).toBeDefined();

      // Should extract display_value
      const fieldsText = JSON.stringify(blocks);
      expect(fieldsText).toContain("John Smith");
      expect(fieldsText).toContain("Open");
    });

    it("should format journal entries correctly", () => {
      const caseData = { number: "SCS0000001", sys_id: "abc" };
      const journalEntries = [
        {
          sys_created_on: "2025-10-28T10:00:00Z",
          sys_created_by: "jsmith",
          value: "Contacted user, troubleshooting in progress",
        },
        {
          sys_created_on: "2025-10-28T11:30:00Z",
          sys_created_by: "jdoe",
          value: "Issue resolved",
        },
      ];

      const blocks = formatCaseAsBlockKit(caseData, {
        includeJournal: true,
        journalEntries,
      });

      // Find Latest Activity section
      const activityHeader = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Latest Activity"),
      );
      expect(activityHeader).toBeDefined();
      expect(activityHeader.text.text).toContain("showing 2 of 2");

      // Find journal entry context blocks
      const journalBlocks = blocks.filter(
        (b) => b.type === "context" && b.elements?.[0]?.text?.includes("jsmith"),
      );
      expect(journalBlocks.length).toBeGreaterThan(0);
    });

    it("should limit journal entries to max 3", () => {
      const caseData = { number: "SCS0000001", sys_id: "abc" };
      const journalEntries = Array.from({ length: 10 }, (_, i) => ({
        sys_created_on: "2025-10-28T10:00:00Z",
        sys_created_by: `user${i}`,
        value: `Entry ${i}`,
      }));

      const blocks = formatCaseAsBlockKit(caseData, {
        includeJournal: true,
        journalEntries,
      });

      // Should show "showing 3 of 10"
      const activityHeader = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Latest Activity"),
      );
      expect(activityHeader.text.text).toContain("3 of 10");

      // Should have "+7 more entries" context
      const moreEntriesBlock = blocks.find(
        (b) => b.type === "context" && b.elements?.[0]?.text?.includes("+7 more"),
      );
      expect(moreEntriesBlock).toBeDefined();
    });

    it("should truncate long descriptions", () => {
      const longDescription = "A".repeat(3000);
      const caseData = {
        number: "SCS0000001",
        sys_id: "abc",
        description: longDescription,
      };

      const blocks = formatCaseAsBlockKit(caseData);
      const descBlock = blocks.find((b) => b.text?.text?.includes("Description:"));

      expect(descBlock).toBeDefined();
      expect(descBlock.text.text.length).toBeLessThan(3000);
      expect(descBlock.text.text).toContain("[Description truncated");
    });

    it("should not exceed 50 block limit", () => {
      const caseData = {
        number: "SCS0000001",
        sys_id: "abc",
        description: "Test case",
      };

      const blocks = formatCaseAsBlockKit(caseData);

      expect(blocks.length).toBeLessThanOrEqual(50);
    });

    it("should include ServiceNow deep link in actions", () => {
      const caseData = {
        number: "SCS0046363",
        sys_id: "abc123",
      };

      const blocks = formatCaseAsBlockKit(caseData);

      const actionsBlock = blocks.find((b) => b.type === "actions");
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock.elements[0].url).toBeDefined();
      expect(actionsBlock.elements[0].url).toContain("sys_id=abc123");
    });

    it("should handle journal entries with value as object", () => {
      const caseData = { number: "SCS0000001", sys_id: "abc" };
      const journalEntries = [
        {
          sys_created_on: "2025-10-28T10:00:00Z",
          sys_created_by: "jsmith",
          value: {
            display_value: "Status update",
            value: "Status update",
          },
        },
      ];

      const blocks = formatCaseAsBlockKit(caseData, {
        includeJournal: true,
        journalEntries,
      });

      const journalBlock = blocks.find(
        (b) => b.type === "context" && b.elements?.[0]?.text?.includes("Status update"),
      );
      expect(journalBlock).toBeDefined();
    });

    it("should truncate long journal entries at word boundary", () => {
      const caseData = { number: "SCS0000001", sys_id: "abc" };
      const longContent = "This is a very long journal entry that should be truncated at a word boundary. ".repeat(10);
      const journalEntries = [
        {
          sys_created_on: "2025-10-28T10:00:00Z",
          sys_created_by: "jsmith",
          value: longContent,
        },
      ];

      const blocks = formatCaseAsBlockKit(caseData, {
        includeJournal: true,
        journalEntries,
      });

      const journalBlock = blocks.find(
        (b) => b.type === "context" && b.elements?.[0]?.text?.includes("jsmith"),
      );
      expect(journalBlock).toBeDefined();
      expect(journalBlock.elements[0].text.length).toBeLessThan(300);
      expect(journalBlock.elements[0].text).toContain("...");
    });
  });

  describe("generateCaseFallbackText", () => {
    it("should generate complete fallback text", () => {
      const caseData = {
        number: "SCS0046363",
        short_description: "Email issue",
        state: "Open",
        priority: "2",
      };

      const fallback = generateCaseFallbackText(caseData);

      expect(fallback).toContain("SCS0046363");
      expect(fallback).toContain("Email issue");
      expect(fallback).toContain("Open");
      expect(fallback).toContain("2");
    });

    it("should handle missing fields in fallback", () => {
      const caseData = {
        number: undefined,
        short_description: undefined,
      };

      const fallback = generateCaseFallbackText(caseData as any);

      expect(fallback).toContain("Unknown");
      expect(fallback).toContain("No description");
    });

    it("should extract values from object-style fields", () => {
      const caseData = {
        number: "SCS0000001",
        short_description: "Test",
        state: { display_value: "Work in Progress", value: "2" },
        priority: { display_value: "1 - Critical", value: "1" },
      };

      const fallback = generateCaseFallbackText(caseData);

      expect(fallback).toContain("Work in Progress");
      expect(fallback).toContain("1 - Critical");
    });
  });
});
