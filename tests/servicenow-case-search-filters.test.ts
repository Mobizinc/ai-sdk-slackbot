/**
 * ServiceNow Case Search Filtering Tests
 * Tests for enhanced filtering capabilities (Issue #47 fix)
 *
 * Tests cover:
 * - Hybrid matching (sys_id > exact name > fuzzy)
 * - Assignment group filtering (name, sys_id, company, person)
 * - Date range filtering
 * - Priority, state, and category filters
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ServiceNowClient } from "../lib/tools/servicenow";

describe("ServiceNow Case Search - Enhanced Filtering (Issue #47)", () => {
  let client: ServiceNowClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new ServiceNowClient();

    // Mock the global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock environment variables
    process.env.SERVICENOW_INSTANCE_URL = "https://test.service-now.com";
    process.env.SERVICENOW_USERNAME = "test_user";
    process.env.SERVICENOW_PASSWORD = "test_password";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SERVICENOW_INSTANCE_URL;
    delete process.env.SERVICENOW_USERNAME;
    delete process.env.SERVICENOW_PASSWORD;
  });

  describe("Hybrid Client Matching", () => {
    it("should use exact sys_id match when accountSysId provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        accountSysId: "abc123",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(url).toContain("sysparm_query=");
      expect(decodeURIComponent(url)).toContain("account=abc123");
    });

    it("should use exact name match when accountName provided without sys_id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        accountName: "Altus Community Healthcare",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(url).toContain("sysparm_query=");
      expect(decodeURIComponent(url)).toContain("account.name=Altus Community Healthcare");
      // Should NOT use LIKE operator
      expect(decodeURIComponent(url)).not.toContain("account.nameLIKE");
    });

    it("should prioritize sys_id over name when both provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        accountSysId: "abc123",
        accountName: "Altus",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      // Should use sys_id, not name
      expect(decodeURIComponent(url)).toContain("account=abc123");
      expect(decodeURIComponent(url)).not.toContain("account.name=");
    });
  });

  describe("Assignment Group Filtering (Igor's Use Case)", () => {
    it("should filter by assignment group company", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        accountName: "Altus Community Healthcare",
        assignmentGroupCompany: "Mobiz IT",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("account.name=Altus Community Healthcare");
      expect(decodeURIComponent(url)).toContain("assignment_group.company.name=Mobiz IT");
    });

    it("should filter by assignment group name", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        assignmentGroup: "Helpdesk",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("assignment_group.name=Helpdesk");
    });

    it("should filter by assignment group sys_id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        assignmentGroupSysId: "group123",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("assignment_group=group123");
    });

    it("should filter by assigned person", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        assignedTo: "John Smith",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("assigned_to.name=John Smith");
    });

    it("should prioritize sys_id over name for assignment groups", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        assignmentGroupSysId: "group123",
        assignmentGroup: "Helpdesk",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("assignment_group=group123");
      expect(decodeURIComponent(url)).not.toContain("assignment_group.name=");
    });
  });

  describe("Date Range Filtering", () => {
    it("should filter cases opened after specific date", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        openedAfter: "2025-11-01",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("opened_at>=2025-11-01");
    });

    it("should filter cases opened before specific date", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        openedBefore: "2025-11-04",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("opened_at<=2025-11-04");
    });

    it("should support date range with both openedAfter and openedBefore", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        openedAfter: "2025-11-01",
        openedBefore: "2025-11-04",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("opened_at>=2025-11-01");
      expect(decodeURIComponent(url)).toContain("opened_at<=2025-11-04");
    });
  });

  describe("Status Filtering", () => {
    it("should filter by priority", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        priority: "2",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("priority=2");
    });

    it("should filter by state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        state: "1",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("state=1");
    });

    it("should filter by category", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        category: "Hardware",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("category=Hardware");
    });

    it("should filter by subcategory", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        subcategory: "Printer",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("subcategory=Printer");
    });

    it("should filter active cases only", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        activeOnly: true,
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("active=true");
    });
  });

  describe("Combined Filters (Igor's Scenario)", () => {
    it("should handle complex multi-filter query (full Igor scenario)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [
            {
              sys_id: "case123",
              number: "SCS0050085",
              short_description: "Welligent audit access request",
              priority: "3",
              state: "1",
              account: "Altus Community Healthcare",
              company: "Mobiz Inc",
              assignment_group: "Helpdesk",
              assigned_to: "John Smith",
              opened_at: "2025-11-03 18:43:00",
              sys_updated_on: "2025-11-03 18:43:00",
              category: "User Access Management",
              subcategory: "Account Creation",
            },
          ],
        }),
      });

      const results = await client.searchCustomerCases({
        accountName: "Altus Community Healthcare",
        assignmentGroupCompany: "Mobiz IT",
        openedBefore: "2025-11-01",
        activeOnly: true,
        limit: 10,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];
      const decodedUrl = decodeURIComponent(url);

      // Verify all filters are applied
      expect(decodedUrl).toContain("account.name=Altus Community Healthcare");
      expect(decodedUrl).toContain("assignment_group.company.name=Mobiz IT");
      expect(decodedUrl).toContain("opened_at<=2025-11-01");
      expect(decodedUrl).toContain("active=true");
      expect(decodedUrl).toContain("sysparm_limit=10");

      // Verify filters are combined with AND operator (^)
      expect(decodedUrl).toContain("^");

      // Verify results are returned correctly
      expect(results).toHaveLength(1);
      expect(results[0].number).toBe("SCS0050085");
      expect(results[0].account).toBe("Altus Community Healthcare");
    });

    it("should handle priority and state filters with client filtering", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        accountName: "Altus",
        priority: "2",
        state: "1",
        assignmentGroupCompany: "Mobiz IT",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];
      const decodedUrl = decodeURIComponent(url);

      expect(decodedUrl).toContain("account.name=Altus");
      expect(decodedUrl).toContain("priority=2");
      expect(decodedUrl).toContain("state=1");
      expect(decodedUrl).toContain("assignment_group.company.name=Mobiz IT");
    });
  });

  describe("Response Field Expansion", () => {
    it("should request expanded field set including assignment info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        accountName: "Test Client",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      // Verify expanded field list
      expect(decodeURIComponent(url)).toContain("sysparm_fields=");
      expect(decodeURIComponent(url)).toContain("assignment_group");
      expect(decodeURIComponent(url)).toContain("assigned_to");
      expect(decodeURIComponent(url)).toContain("category");
      expect(decodeURIComponent(url)).toContain("subcategory");
    });
  });

  describe("Backward Compatibility", () => {
    it("should still support legacy fuzzy search with query parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        query: "printer",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("short_descriptionLIKEprinter");
    });

    it("should support legacy companyName parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      });

      await client.searchCustomerCases({
        companyName: "Mobiz Inc",
        limit: 5,
      });

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];

      expect(decodeURIComponent(url)).toContain("company.name=Mobiz Inc");
    });
  });

  describe("Error Handling", () => {
    it("should handle ServiceNow API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        client.searchCustomerCases({
          accountName: "Test",
          limit: 5,
        })
      ).rejects.toThrow("ServiceNow request failed");
    });

    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        client.searchCustomerCases({
          accountName: "Test",
          limit: 5,
        })
      ).rejects.toThrow("Network error");
    });
  });
});
