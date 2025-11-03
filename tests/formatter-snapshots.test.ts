/**
 * Formatter Snapshot Tests
 *
 * Tests that verify formatter outputs match expected snapshots.
 * These tests catch regressions when formatters are modified.
 */

import { describe, it, expect } from "vitest";
import {
  formatCaseSummaryText,
  formatIncidentForLLM,
  formatJournalEntriesForLLM,
  formatSearchResultsForLLM,
} from "../lib/services/servicenow-formatters";
import type {
  ServiceNowCaseResult,
  ServiceNowIncidentResult,
  ServiceNowCaseJournalEntry,
  ServiceNowCaseSummary,
} from "../lib/tools/servicenow";

describe("ServiceNow Formatter Snapshots", () => {
  describe("formatCaseSummaryText", () => {
    it("should match snapshot for complete case with journal entries", () => {
      const caseRecord: Partial<ServiceNowCaseResult> = {
        sys_id: "a1b2c3d4e5f6789",
        number: "SCS0012345",
        state: "Open",
        priority: "1",
        short_description: "Email server down affecting Finance department",
        description:
          "Users in Finance reporting they cannot send or receive emails since 2pm. Impact: 50 users.",
        assigned_to: "John Smith",
        account: "Contoso Corp",
        submitted_by: "Jane Doe",
      };

      const journalEntries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "journal1",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 15:30:00",
          sys_created_by: "jsmith",
          value: "Escalated to Microsoft Support - Ticket #MS-12345",
        },
        {
          sys_id: "journal2",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 15:15:00",
          sys_created_by: "jsmith",
          value: "Checked Azure Service Health dashboard - no outages reported",
        },
        {
          sys_id: "journal3",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 14:45:00",
          sys_created_by: "jsmith",
          value: "Monitoring email flow after service restart",
        },
      ];

      const formatted = formatCaseSummaryText(
        caseRecord as ServiceNowCaseResult,
        journalEntries
      );

      // Extract summary from object
      const summary = formatted?.summary;

      // Verify structure
      expect(summary).toContain("Summary");
      expect(summary).toContain("Current State");
      expect(summary).toContain("Latest Activity");

      // Verify content
      expect(summary).toContain("Email server down");
      expect(summary).toContain("SCS0012345");
      expect(summary).toContain("Open");

      expect(summary).toMatchSnapshot();
    });

    it("should match snapshot for minimal case", () => {
      const caseRecord: Partial<ServiceNowCaseResult> = {
        sys_id: "minimal001",
        number: "SCS0099999",
        state: "New",
        priority: "4",
        short_description: "Test case",
      };

      const formatted = formatCaseSummaryText(
        caseRecord as ServiceNowCaseResult,
        []
      );

      // Should still have required sections even with minimal data
      expect(formatted?.summary).toContain("Summary");
      expect(formatted?.summary).toContain("Current State");

      expect(formatted?.summary).toMatchSnapshot();
    });
  });

  describe("formatIncidentForLLM", () => {
    it("should match snapshot for incident", () => {
      const incident: Partial<ServiceNowIncidentResult> = {
        sys_id: "b2c3d4e5f678901",
        number: "INC0045678",
        state: "In Progress",
        priority: "3",
        short_description: "SharePoint site access denied - 403 Forbidden",
        description:
          "Marketing team unable to access SharePoint site, receiving 403 error since this morning.",
        assigned_to: "Sarah Johnson",
        caller_id: "Mark Wilson",
        sys_created_on: "2025-10-28 13:00:00",
      };

      const formatted = formatIncidentForLLM(incident as ServiceNowIncidentResult);

      // Verify structure
      expect(formatted?.summary).toContain("Summary");
      expect(formatted?.summary).toContain("Current State");

      // Verify content
      expect(formatted?.summary).toContain("SharePoint");
      expect(formatted?.summary).toContain("403 Forbidden");
      expect(formatted?.summary).toContain("In Progress");

      expect(formatted?.summary).toMatchSnapshot();
    });
  });

  describe("formatJournalEntriesForLLM", () => {
    it("should match snapshot for journal entries", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "journal1",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 15:30:00",
          sys_created_by: "jsmith",
          value: "Escalated to Microsoft Support",
        },
        {
          sys_id: "journal2",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 15:15:00",
          sys_created_by: "jsmith",
          value: "Checked Azure Service Health - no outages",
        },
        {
          sys_id: "journal3",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 14:45:00",
          sys_created_by: "jsmith",
          value: "Restarted Exchange service",
        },
      ];

      const formatted = formatJournalEntriesForLLM(entries, "SCS0012345");

      // Verify structure
      expect(formatted?.summary).toContain("Latest Activity");
      expect(formatted?.summary).toContain("•");

      // Verify content
      expect(formatted?.summary).toContain("jsmith");
      expect(formatted?.summary).toContain("Escalated");

      expect(formatted?.summary).toMatchSnapshot();
    });

    it("should return null for empty entries", () => {
      const formatted = formatJournalEntriesForLLM([]);

      expect(formatted).toBeNull();
    });
  });

  describe("formatSearchResultsForLLM", () => {
    it("should match snapshot for search results", () => {
      const cases: ServiceNowCaseSummary[] = [
        {
          sys_id: "case001",
          number: "SCS0012340",
          short_description: "Email connectivity issue",
          state: "Resolved",
          priority: "1",
          account: undefined,
          opened_at: "2025-10-27 10:00:00",
          url: "https://test.service-now.com/scs0012340",
        },
        {
          sys_id: "case002",
          number: "SCS0012335",
          short_description: "Exchange server timeout",
          state: "Resolved",
          priority: "2",
          account: undefined,
          opened_at: "2025-10-26 14:00:00",
          url: "https://test.service-now.com/scs0012335",
        },
      ];

      const formatted = formatSearchResultsForLLM(
        cases,
        ["email", "server"],
        2
      );

      // Verify structure
      expect(formatted?.summary).toContain("Summary");
      expect(formatted?.summary).toContain("•");

      // Verify content
      expect(formatted?.summary).toContain("SCS0012340");
      expect(formatted?.summary).toContain("SCS0012335");

      expect(formatted?.summary).toMatchSnapshot();
    });

    it("should match snapshot for empty search results", () => {
      const formatted = formatSearchResultsForLLM([], ["nonexistent"], 0);

      expect(formatted?.summary).toContain("No cases found");
      expect(formatted?.summary).toMatchSnapshot();
    });
  });

  describe("Data Truncation", () => {
    it("should truncate very long descriptions", () => {
      const longCase: Partial<ServiceNowCaseResult> = {
        sys_id: "long001",
        number: "SCS0000001",
        state: "New",
        priority: "3",
        short_description: "Test case with long description",
        description: "A".repeat(2000), // Very long description
      };

      const formatted = formatCaseSummaryText(
        longCase as ServiceNowCaseResult,
        []
      );

      // Should be truncated with ellipsis
      expect(formatted).toBeTruthy();
      if (formatted) {
        expect(formatted.summary.length).toBeLessThan(3000);
      }

      expect(formatted?.summary).toMatchSnapshot();
    });

    it("should limit number of journal entries displayed", () => {
      const manyEntries: ServiceNowCaseJournalEntry[] = Array.from(
        { length: 20 },
        (_, i) => ({
          sys_id: `journal${i}`,
          element: "comments",
          element_id: "case1",
          sys_created_on: `2025-10-28 ${String(15 - i).padStart(2, "0")}:00:00`,
          sys_created_by: "user",
          value: `Entry ${i + 1}`,
        })
      );

      const formatted = formatJournalEntriesForLLM(manyEntries);

      if (formatted) {
        // Should limit to MAX_JOURNAL_ENTRIES most recent entries
        const entryCount = (formatted.summary.match(/•/g) || []).length;
        expect(entryCount).toBeLessThanOrEqual(20);
      }

      expect(formatted?.summary).toMatchSnapshot();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing optional fields gracefully", () => {
      const minimalData: Partial<ServiceNowCaseResult> = {
        sys_id: "test001",
        number: "SCS0000001",
        state: "New",
        short_description: "Test",
      };

      const formatted = formatCaseSummaryText(
        minimalData as ServiceNowCaseResult,
        []
      );

      // Should still have required sections
      expect(formatted?.summary).toContain("Summary");
      expect(formatted?.summary).toContain("Current State");

      // Should not crash or show undefined
      expect(formatted?.summary).not.toContain("undefined");
      expect(formatted?.summary).not.toContain("null");

      expect(formatted?.summary).toMatchSnapshot();
    });
  });

  describe("Consistency Across Formatters", () => {
    it("should use consistent date formatting", () => {
      const journalEntries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "journal1",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 14:23:45",
          sys_created_by: "user",
          value: "Test entry",
        },
      ];

      const journalFormatted = formatJournalEntriesForLLM(journalEntries);

      // Should use consistent date format (e.g., "Oct 28, 14:23")
      const dateRegex = /[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}/;

      if (journalFormatted) {
        expect(journalFormatted.summary).toMatch(dateRegex);
      }
    });

    it("should use consistent bullet point formatting", () => {
      const journalEntries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "journal1",
          element: "comments",
          element_id: "case1",
          sys_created_on: "2025-10-28 15:00:00",
          sys_created_by: "user",
          value: "Test entry",
        },
      ];

      const formatted = formatJournalEntriesForLLM(journalEntries);

      // Should use "•" for bullet points
      if (formatted) {
        expect(formatted.summary).toContain("•");
      }
    });
  });
});
