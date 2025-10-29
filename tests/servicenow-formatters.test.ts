import { describe, expect, it } from "vitest";
import {
  sanitizeCaseText,
  formatJournalTimestamp,
  truncateWithEllipsis,
  sanitizeJournalEntry,
  deduplicateJournalEntries,
  formatCaseSummaryText,
  formatIncidentForLLM,
  formatJournalEntriesForLLM,
  formatSearchResultsForLLM,
  formatConfigurationItemsForLLM,
} from "../lib/services/servicenow-formatters";
import type {
  ServiceNowCaseResult,
  ServiceNowCaseJournalEntry,
  ServiceNowIncidentResult,
  ServiceNowCaseSummary,
  ServiceNowConfigurationItem,
} from "../lib/tools/servicenow";

describe("ServiceNow Formatters", () => {
  describe("sanitizeCaseText", () => {
    it("should return null for null or undefined values", () => {
      expect(sanitizeCaseText(null)).toBe(null);
      expect(sanitizeCaseText(undefined)).toBe(null);
      expect(sanitizeCaseText("")).toBe(null);
    });

    it("should strip HTML br tags and replace with spaces", () => {
      expect(sanitizeCaseText("Line 1<br>Line 2")).toBe("Line 1 Line 2");
      expect(sanitizeCaseText("Line 1<br/>Line 2")).toBe("Line 1 Line 2");
      expect(sanitizeCaseText("Line 1<BR>Line 2")).toBe("Line 1 Line 2");
    });

    it("should strip HTML p tags and replace with spaces", () => {
      expect(sanitizeCaseText("<p>Paragraph 1</p><p>Paragraph 2</p>")).toBe(
        "Paragraph 1 Paragraph 2"
      );
    });

    it("should strip strong and em tags without adding spaces", () => {
      expect(sanitizeCaseText("This is <strong>bold</strong> text")).toBe(
        "This is bold text"
      );
      expect(sanitizeCaseText("This is <em>italic</em> text")).toBe(
        "This is italic text"
      );
    });

    it("should strip all other HTML tags", () => {
      expect(sanitizeCaseText("<div>Content</div>")).toBe("Content");
      expect(sanitizeCaseText("<span class='test'>Text</span>")).toBe("Text");
      expect(
        sanitizeCaseText("<a href='http://example.com'>Link</a>")
      ).toBe("Link");
    });

    it("should normalize multiple spaces to single space", () => {
      expect(sanitizeCaseText("Text    with    spaces")).toBe("Text with spaces");
      expect(sanitizeCaseText("Text\n\n\nwith\nnewlines")).toBe(
        "Text with newlines"
      );
      expect(sanitizeCaseText("Text\t\t\twith\ttabs")).toBe("Text with tabs");
    });

    it("should trim leading and trailing whitespace", () => {
      expect(sanitizeCaseText("  Text  ")).toBe("Text");
      expect(sanitizeCaseText("\n\nText\n\n")).toBe("Text");
    });

    it("should handle complex HTML with mixed formatting", () => {
      const input = `
        <div class="case-desc">
          <p>This is a <strong>critical</strong> issue.</p>
          <br/>
          <p>Please <em>investigate</em> immediately.</p>
        </div>
      `;
      expect(sanitizeCaseText(input)).toBe(
        "This is a critical issue. Please investigate immediately."
      );
    });

    it("should handle special characters", () => {
      expect(sanitizeCaseText("Price: $100 & up")).toBe("Price: $100 & up");
      expect(sanitizeCaseText("User@example.com")).toBe("User@example.com");
    });

    it("should return null for strings that become empty after cleaning", () => {
      expect(sanitizeCaseText("<div></div>")).toBe(null);
      expect(sanitizeCaseText("   ")).toBe(null);
      expect(sanitizeCaseText("<br/><br/>")).toBe(null);
    });
  });

  describe("formatJournalTimestamp", () => {
    it("should return null for null or undefined values", () => {
      expect(formatJournalTimestamp(null)).toBe(null);
      expect(formatJournalTimestamp(undefined)).toBe(null);
    });

    it("should return null for invalid date strings", () => {
      expect(formatJournalTimestamp("invalid-date")).toBe(null);
      expect(formatJournalTimestamp("")).toBe(null);
    });

    it("should format valid ISO timestamps correctly", () => {
      const timestamp = "2025-01-15T14:30:00Z";
      const result = formatJournalTimestamp(timestamp);
      expect(result).toMatch(/Jan 15, \d{2}:\d{2}/);
    });

    it("should use 24-hour format", () => {
      const timestamp = "2025-01-15T15:45:00Z";
      const result = formatJournalTimestamp(timestamp);
      // Should not contain AM/PM
      expect(result).not.toMatch(/AM|PM/);
    });

    it("should handle different months", () => {
      expect(formatJournalTimestamp("2025-03-10T10:00:00Z")).toMatch(/Mar 10/);
      expect(formatJournalTimestamp("2025-12-25T10:00:00Z")).toMatch(/Dec 25/);
    });
  });

  describe("truncateWithEllipsis", () => {
    it("should not truncate text shorter than maxLength", () => {
      const text = "Short text";
      const result = truncateWithEllipsis(text, 100);
      expect(result.text).toBe("Short text");
      expect(result.wasTruncated).toBe(false);
    });

    it("should not truncate text equal to maxLength", () => {
      const text = "x".repeat(100);
      const result = truncateWithEllipsis(text, 100);
      expect(result.text).toBe(text);
      expect(result.wasTruncated).toBe(false);
    });

    it("should truncate text longer than maxLength", () => {
      const text = "This is a very long text that needs to be truncated";
      const result = truncateWithEllipsis(text, 20);
      expect(result.text.length).toBeLessThanOrEqual(20);
      expect(result.text).toContain("...");
      expect(result.wasTruncated).toBe(true);
    });

    it("should truncate at word boundaries when possible", () => {
      const text = "The quick brown fox jumps over the lazy dog";
      const result = truncateWithEllipsis(text, 25);
      // Should end with complete word followed by ellipsis
      expect(result.text).toMatch(/\s\w+\.\.\.$/);
      expect(result.wasTruncated).toBe(true);
    });

    it("should handle text with no spaces gracefully", () => {
      const text = "x".repeat(150);
      const result = truncateWithEllipsis(text, 100);
      expect(result.text.length).toBeLessThanOrEqual(100);
      expect(result.text).toContain("...");
      expect(result.wasTruncated).toBe(true);
    });

    it("should use default maxLength of 1000 when not specified", () => {
      const text = "x".repeat(1500);
      const result = truncateWithEllipsis(text);
      expect(result.text.length).toBeLessThanOrEqual(1000);
      expect(result.wasTruncated).toBe(true);
    });
  });

  describe("sanitizeJournalEntry", () => {
    it("should sanitize and format a complete journal entry", () => {
      const entry: ServiceNowCaseJournalEntry = {
        sys_id: "entry1",
        element: "work_notes",
        element_id: "case1",
        sys_created_on: "2025-01-15T14:30:00Z",
        sys_created_by: "john.doe",
        value: "<p>This is a <strong>work note</strong> with HTML</p>",
      };

      const result = sanitizeJournalEntry(entry);
      expect(result.author).toBe("john.doe");
      expect(result.text).toBe("This is a work note with HTML");
      expect(result.timestamp).toMatch(/Jan 15/);
      expect(result.wasTruncated).toBe(false);
    });

    it("should handle missing or null values gracefully", () => {
      const entry: ServiceNowCaseJournalEntry = {
        sys_id: "entry2",
        element: "work_notes",
        element_id: "case2",
        sys_created_on: "2025-01-15T14:30:00Z",
        sys_created_by: "",
        value: null,
      };

      const result = sanitizeJournalEntry(entry);
      expect(result.author).toBe("unknown");
      expect(result.text).toBe("(no content)");
      expect(result.wasTruncated).toBe(false);
    });

    it("should truncate long journal entries", () => {
      const longText = "x".repeat(1500);
      const entry: ServiceNowCaseJournalEntry = {
        sys_id: "entry3",
        element: "work_notes",
        element_id: "case3",
        sys_created_on: "2025-01-15T14:30:00Z",
        sys_created_by: "admin",
        value: longText,
      };

      const result = sanitizeJournalEntry(entry);
      expect(result.text.length).toBeLessThanOrEqual(1000);
      expect(result.text).toContain("...");
      expect(result.wasTruncated).toBe(true);
    });

    it("should handle invalid timestamps", () => {
      const entry: ServiceNowCaseJournalEntry = {
        sys_id: "entry4",
        element: "work_notes",
        element_id: "case4",
        sys_created_on: "invalid-date",
        sys_created_by: "user",
        value: "Entry text",
      };

      const result = sanitizeJournalEntry(entry);
      expect(result.timestamp).toBe(null);
    });
  });

  describe("deduplicateJournalEntries", () => {
    it("should return empty array for empty input", () => {
      expect(deduplicateJournalEntries([])).toEqual([]);
    });

    it("should return single entry unchanged", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "entry1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: "Entry 1",
        },
      ];

      expect(deduplicateJournalEntries(entries)).toEqual(entries);
    });

    it("should remove consecutive duplicate entries", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "entry1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: "Duplicate text",
        },
        {
          sys_id: "entry2",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:31:00Z",
          sys_created_by: "user",
          value: "Duplicate text",
        },
        {
          sys_id: "entry3",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:32:00Z",
          sys_created_by: "user",
          value: "Different text",
        },
      ];

      const result = deduplicateJournalEntries(entries);
      expect(result).toHaveLength(2);
      expect(result[0].sys_id).toBe("entry1");
      expect(result[1].sys_id).toBe("entry3");
    });

    it("should keep non-consecutive duplicates", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "entry1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: "Text A",
        },
        {
          sys_id: "entry2",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:31:00Z",
          sys_created_by: "user",
          value: "Text B",
        },
        {
          sys_id: "entry3",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:32:00Z",
          sys_created_by: "user",
          value: "Text A",
        },
      ];

      const result = deduplicateJournalEntries(entries);
      expect(result).toHaveLength(3); // All entries should be kept
    });

    it("should handle null values correctly", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "entry1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: null,
        },
        {
          sys_id: "entry2",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:31:00Z",
          sys_created_by: "user",
          value: null,
        },
      ];

      const result = deduplicateJournalEntries(entries);
      expect(result).toHaveLength(1);
    });
  });

  describe("formatCaseSummaryText", () => {
    it("should format complete case with all sections", () => {
      const caseRecord: ServiceNowCaseResult = {
        sys_id: "case1",
        number: "CS0001",
        short_description: "VPN connection issue",
        description: "User cannot connect to VPN from home",
        priority: "1",
        state: "Open",
        assigned_to: "John Doe",
        account: "Altus Healthcare",
        submitted_by: "jane.user@example.com",
        url: "https://instance.service-now.com/case.do?sys_id=case1",
      };

      const journalEntries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "j1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "tech.support",
          value: "Investigating VPN logs",
        },
        {
          sys_id: "j2",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T13:00:00Z",
          sys_created_by: "jane.user",
          value: "Cannot connect since this morning",
        },
      ];

      const result = formatCaseSummaryText(caseRecord, journalEntries);

      expect(result).toContain("Summary");
      expect(result).toContain("VPN connection issue");
      expect(result).toContain("Current State");
      expect(result).toContain("Status: Open");
      expect(result).toContain("Priority: 1");
      expect(result).toContain("Assigned: John Doe");
      expect(result).toContain("Latest Activity");
      expect(result).toContain("tech.support");
      expect(result).toContain("Investigating VPN logs");
      expect(result).toContain("Context");
      expect(result).toContain("User cannot connect to VPN from home");
      expect(result).toContain("References");
      expect(result).toContain("CS0001");
    });

    it("should show up to 5 journal entries in Latest Activity", () => {
      const caseRecord: ServiceNowCaseResult = {
        sys_id: "case1",
        number: "CS0001",
        short_description: "Test case",
        url: "https://instance.service-now.com/case.do?sys_id=case1",
      };

      const journalEntries: ServiceNowCaseJournalEntry[] = Array.from(
        { length: 10 },
        (_, i) => ({
          sys_id: `j${i}`,
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: `Entry ${i}`,
        })
      );

      const result = formatCaseSummaryText(caseRecord, journalEntries);

      // Should contain first 5 entries
      expect(result).toContain("Entry 0");
      expect(result).toContain("Entry 4");
      // Should not contain 6th+ entries
      expect(result).not.toContain("Entry 5");
      expect(result).not.toContain("Entry 9");
    });

    it("should handle missing optional fields gracefully", () => {
      const caseRecord: ServiceNowCaseResult = {
        sys_id: "case1",
        number: "CS0001",
      };

      const result = formatCaseSummaryText(caseRecord, []);

      expect(result).toContain("References");
      expect(result).toContain("CS0001");
      // Should not have empty sections
      expect(result).not.toMatch(/Summary\s*\n\s*Current State/);
    });

    it("should use account/requester in Context when description is missing", () => {
      const caseRecord: ServiceNowCaseResult = {
        sys_id: "case1",
        number: "CS0001",
        short_description: "Issue",
        account: "Altus Healthcare",
        submitted_by: "user@example.com",
        url: "https://instance.service-now.com/case.do?sys_id=case1",
      };

      const result = formatCaseSummaryText(caseRecord, []);

      expect(result).toContain("Context");
      expect(result).toContain("Account: Altus Healthcare");
      expect(result).toContain("Requester: user@example.com");
    });

    it("should deduplicate journal entries", () => {
      const caseRecord: ServiceNowCaseResult = {
        sys_id: "case1",
        number: "CS0001",
        short_description: "Test",
        url: "https://instance.service-now.com/case.do?sys_id=case1",
      };

      const journalEntries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "j1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: "Same text",
        },
        {
          sys_id: "j2",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:31:00Z",
          sys_created_by: "user",
          value: "Same text",
        },
      ];

      const result = formatCaseSummaryText(caseRecord, journalEntries);

      // Should only show one instance due to deduplication
      const matches = result?.match(/Same text/g);
      expect(matches).toHaveLength(1);
    });

    it("should return null for completely empty case", () => {
      const caseRecord: ServiceNowCaseResult = {
        sys_id: "case1",
        number: "",
      };

      const result = formatCaseSummaryText(caseRecord, []);
      expect(result).toBe(null);
    });
  });

  describe("formatIncidentForLLM", () => {
    it("should format complete incident with all sections", () => {
      const incident: ServiceNowIncidentResult = {
        sys_id: "inc1",
        number: "INC0001",
        short_description: "Database connection timeout",
        state: "In Progress",
        url: "https://instance.service-now.com/incident.do?sys_id=inc1",
      };

      const result = formatIncidentForLLM(incident);

      expect(result).toContain("Summary");
      expect(result).toContain("Database connection timeout");
      expect(result).toContain("Current State");
      expect(result).toContain("Status: In Progress");
      expect(result).toContain("References");
      expect(result).toContain("INC0001");
    });

    it("should handle missing state", () => {
      const incident: ServiceNowIncidentResult = {
        sys_id: "inc1",
        number: "INC0001",
        short_description: "Test incident",
        url: "https://instance.service-now.com/incident.do?sys_id=inc1",
      };

      const result = formatIncidentForLLM(incident);

      expect(result).toContain("Summary");
      expect(result).toContain("Test incident");
      expect(result).not.toContain("Current State");
    });

    it("should return null for completely empty incident", () => {
      const incident: ServiceNowIncidentResult = {
        sys_id: "inc1",
        number: "",
        short_description: "",
        url: "",
      };

      const result = formatIncidentForLLM(incident);
      expect(result).toBe(null);
    });

    it("should format reference as link when URL is present", () => {
      const incident: ServiceNowIncidentResult = {
        sys_id: "inc1",
        number: "INC0001",
        short_description: "Test",
        url: "https://instance.service-now.com/incident.do?sys_id=inc1",
      };

      const result = formatIncidentForLLM(incident);

      expect(result).toContain("<https://instance.service-now.com");
      expect(result).toContain("|INC0001>");
    });
  });

  describe("formatJournalEntriesForLLM", () => {
    it("should format journal entries with summary and activity", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "j1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user1",
          value: "First entry",
        },
        {
          sys_id: "j2",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:31:00Z",
          sys_created_by: "user2",
          value: "Second entry",
        },
      ];

      const result = formatJournalEntriesForLLM(entries, "CS0001");

      expect(result).toContain("Summary");
      expect(result).toContain("2 journal entries for CS0001");
      expect(result).toContain("Latest Activity");
      expect(result).toContain("user1");
      expect(result).toContain("First entry");
      expect(result).toContain("user2");
      expect(result).toContain("Second entry");
    });

    it("should return null for empty entries", () => {
      const result = formatJournalEntriesForLLM([]);
      expect(result).toBe(null);
    });

    it("should limit to 5 entries in Latest Activity", () => {
      const entries: ServiceNowCaseJournalEntry[] = Array.from(
        { length: 10 },
        (_, i) => ({
          sys_id: `j${i}`,
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: `Entry ${i}`,
        })
      );

      const result = formatJournalEntriesForLLM(entries);

      expect(result).toContain("Entry 0");
      expect(result).toContain("Entry 4");
      expect(result).not.toContain("Entry 5");
      expect(result).toContain("Context");
      expect(result).toContain("Showing 5 of 10 entries");
    });

    it("should not show context section when all entries fit", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "j1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: "Entry",
        },
      ];

      const result = formatJournalEntriesForLLM(entries);

      expect(result).toContain("Summary");
      expect(result).toContain("Latest Activity");
      expect(result).not.toContain("Context");
    });

    it("should work without case name", () => {
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "j1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: "Entry",
        },
      ];

      const result = formatJournalEntriesForLLM(entries);

      expect(result).toContain("1 journal entries");
      expect(result).not.toContain("for");
    });

    it("should include truncation indicators for long entries", () => {
      const longText = "x".repeat(1500);
      const entries: ServiceNowCaseJournalEntry[] = [
        {
          sys_id: "j1",
          element: "work_notes",
          element_id: "case1",
          sys_created_on: "2025-01-15T14:30:00Z",
          sys_created_by: "user",
          value: longText,
        },
      ];

      const result = formatJournalEntriesForLLM(entries);

      expect(result).toContain("[truncated]");
    });
  });

  describe("formatSearchResultsForLLM", () => {
    it("should format search results with all sections", () => {
      const cases: ServiceNowCaseSummary[] = [
        {
          sys_id: "case1",
          number: "CS0001",
          short_description: "VPN issue",
          priority: "1",
          state: "Open",
          url: "https://instance.service-now.com/case.do?sys_id=case1",
        },
        {
          sys_id: "case2",
          number: "CS0002",
          short_description: "Email problem",
          priority: "2",
          state: "Work in Progress",
          url: "https://instance.service-now.com/case.do?sys_id=case2",
        },
      ];

      const filters = ["account: Altus Healthcare", "priority: 1"];
      const result = formatSearchResultsForLLM(cases, filters, 2);

      expect(result).toContain("Summary");
      expect(result).toContain("Found 2 cases");
      expect(result).toContain("Current State");
      expect(result).toContain("Filters: account: Altus Healthcare, priority: 1");
      expect(result).toContain("Latest Activity");
      expect(result).toContain("CS0001");
      expect(result).toContain("VPN issue");
      expect(result).toContain("[P1]");
      expect(result).toContain("(Open)");
    });

    it("should return message for no results", () => {
      const result = formatSearchResultsForLLM([], [], 0);

      expect(result).toContain("Summary");
      expect(result).toContain("No cases found");
    });

    it("should limit to 10 results in Latest Activity", () => {
      const cases: ServiceNowCaseSummary[] = Array.from({ length: 20 }, (_, i) => ({
        sys_id: `case${i}`,
        number: `CS${String(i).padStart(4, "0")}`,
        short_description: `Case ${i}`,
        url: `https://instance.service-now.com/case.do?sys_id=case${i}`,
      }));

      const result = formatSearchResultsForLLM(cases, [], 20);

      expect(result).toContain("CS0000");
      expect(result).toContain("CS0009");
      expect(result).not.toContain("CS0010");
      expect(result).toContain("Context");
      expect(result).toContain("Showing top 10 of 20 results");
    });

    it("should handle cases without URLs", () => {
      const cases: ServiceNowCaseSummary[] = [
        {
          sys_id: "case1",
          number: "CS0001",
          short_description: "Test",
        },
      ];

      const result = formatSearchResultsForLLM(cases, [], 1);

      expect(result).toContain("• CS0001: Test");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    it("should handle missing priority and state", () => {
      const cases: ServiceNowCaseSummary[] = [
        {
          sys_id: "case1",
          number: "CS0001",
          short_description: "Test",
          url: "https://instance.service-now.com/case.do?sys_id=case1",
        },
      ];

      const result = formatSearchResultsForLLM(cases, [], 1);

      expect(result).toContain("CS0001");
      expect(result).toContain("Test");
      expect(result).not.toContain("[P");
      expect(result).not.toContain("(");
    });

    it("should not show Current State section when no filters applied", () => {
      const cases: ServiceNowCaseSummary[] = [
        {
          sys_id: "case1",
          number: "CS0001",
          short_description: "Test",
          url: "https://instance.service-now.com/case.do?sys_id=case1",
        },
      ];

      const result = formatSearchResultsForLLM(cases, [], 1);

      expect(result).not.toContain("Current State");
      expect(result).not.toContain("Filters:");
    });
  });

  describe("formatConfigurationItemsForLLM", () => {
    it("should format configuration items with all sections", () => {
      const items: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci1",
          name: "prod-web-01",
          sys_class_name: "Linux Server",
          status: "Operational",
          environment: "Production",
          ip_addresses: ["192.168.1.10", "10.0.0.5"],
          url: "https://instance.service-now.com/cmdb_ci.do?sys_id=ci1",
        },
        {
          sys_id: "ci2",
          name: "dev-db-01",
          sys_class_name: "MySQL Database",
          status: "Operational",
          environment: "Development",
          ip_addresses: ["192.168.2.20"],
          url: "https://instance.service-now.com/cmdb_ci.do?sys_id=ci2",
        },
      ];

      const result = formatConfigurationItemsForLLM(items);

      expect(result).toContain("Summary");
      expect(result).toContain("Found 2 configuration items");
      expect(result).toContain("Latest Activity");
      expect(result).toContain("prod-web-01");
      expect(result).toContain("Type: Linux Server");
      expect(result).toContain("Status: Operational");
      expect(result).toContain("Env: Production");
      expect(result).toContain("IPs: 192.168.1.10, 10.0.0.5");
    });

    it("should return message for no items", () => {
      const result = formatConfigurationItemsForLLM([]);

      expect(result).toContain("Summary");
      expect(result).toContain("No configuration items found");
    });

    it("should limit to 10 items in Latest Activity", () => {
      const items: ServiceNowConfigurationItem[] = Array.from(
        { length: 15 },
        (_, i) => ({
          sys_id: `ci${i}`,
          name: `server-${i}`,
          ip_addresses: [],
          url: `https://instance.service-now.com/cmdb_ci.do?sys_id=ci${i}`,
        })
      );

      const result = formatConfigurationItemsForLLM(items);

      expect(result).toContain("server-0");
      expect(result).toContain("server-9");
      expect(result).not.toContain("server-10");
      expect(result).toContain("Context");
      expect(result).toContain("Showing top 10 of 15 items");
    });

    it("should handle items without URLs", () => {
      const items: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci1",
          name: "test-server",
          ip_addresses: [],
          url: "",
        },
      ];

      const result = formatConfigurationItemsForLLM(items);

      expect(result).toContain("• test-server");
      expect(result).not.toContain("<");
    });

    it("should handle items with minimal metadata", () => {
      const items: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci1",
          name: "minimal-server",
          ip_addresses: [],
          url: "https://instance.service-now.com/cmdb_ci.do?sys_id=ci1",
        },
      ];

      const result = formatConfigurationItemsForLLM(items);

      expect(result).toContain("minimal-server");
      // Should not show empty metadata brackets
      expect(result).not.toMatch(/\[\s*\]/);
    });

    it("should handle empty IP addresses array", () => {
      const items: ServiceNowConfigurationItem[] = [
        {
          sys_id: "ci1",
          name: "server",
          sys_class_name: "Server",
          ip_addresses: [],
          url: "https://instance.service-now.com/cmdb_ci.do?sys_id=ci1",
        },
      ];

      const result = formatConfigurationItemsForLLM(items);

      expect(result).toContain("server");
      expect(result).not.toContain("IPs:");
    });
  });
});
