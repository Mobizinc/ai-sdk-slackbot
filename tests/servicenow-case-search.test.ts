import { http, HttpResponse } from "msw";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { serviceNowClient } from "../lib/tools/servicenow";
import { server } from "./setup";

describe("ServiceNow Case Search", () => {
  const mockCaseResults = [
    {
      sys_id: "case1_sys_id",
      number: "CS0001",
      short_description: "VPN connection issue",
      priority: { display_value: "1" },
      state: { display_value: "Open" },
      account: { display_value: "Altus Healthcare" },
      company: { display_value: "Altus Healthcare" },
      opened_at: { display_value: "2025-01-15 10:00:00" },
      sys_updated_on: { display_value: "2025-01-15 15:30:00" },
    },
    {
      sys_id: "case2_sys_id",
      number: "CS0002",
      short_description: "VPN timeout errors",
      priority: { display_value: "2" },
      state: { display_value: "Work in Progress" },
      account: { display_value: "Altus Healthcare" },
      company: { display_value: "Altus Healthcare" },
      opened_at: { display_value: "2025-01-16 09:00:00" },
      sys_updated_on: { display_value: "2025-01-16 14:00:00" },
    },
    {
      sys_id: "case3_sys_id",
      number: "CS0003",
      short_description: "Email server down",
      priority: { display_value: "1" },
      state: { display_value: "Open" },
      account: { display_value: "Another Client" },
      company: { display_value: "Another Client" },
      opened_at: { display_value: "2025-01-17 08:00:00" },
      sys_updated_on: { display_value: "2025-01-17 12:00:00" },
    },
  ];

  beforeEach(() => {
    // Mock environment variables for ServiceNow
    process.env.SERVICENOW_INSTANCE_URL = "https://example.service-now.com";
    process.env.SERVICENOW_USERNAME = "test_user";
    process.env.SERVICENOW_PASSWORD = "test_pass";
    process.env.SERVICENOW_CASE_TABLE = "sn_customerservice_case";
  });

  afterEach(() => {
    delete process.env.SERVICENOW_INSTANCE_URL;
    delete process.env.SERVICENOW_USERNAME;
    delete process.env.SERVICENOW_PASSWORD;
    delete process.env.SERVICENOW_CASE_TABLE;
  });

  describe("searchCustomerCases - Basic Functionality", () => {
    it("should search all open cases with no filters", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            // Should have default sort and active=true
            expect(query).toContain("ORDERBYDESCopened_at");
            expect(query).toContain("active=true");
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({});

      expect(results).toHaveLength(3);
      expect(results[0].number).toBe("CS0001");
      expect(results[0].url).toContain("sn_customerservice_case.do?sys_id=case1_sys_id");
    });

    it("should use default limit of 25", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const limit = url.searchParams.get("sysparm_limit");
            
            expect(limit).toBe("25");
            
            return HttpResponse.json({ result: [] });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({});
    });

    it("should respect custom limit parameter", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const limit = url.searchParams.get("sysparm_limit");
            
            expect(limit).toBe("50");
            
            return HttpResponse.json({ result: [] });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({ limit: 50 });
    });
  });

  describe("searchCustomerCases - Filtering", () => {
    it("should filter by company name", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("company.nameLIKEAltus");
            
            return HttpResponse.json({ result: [mockCaseResults[0], mockCaseResults[1]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        companyName: "Altus",
      });

      expect(results).toHaveLength(2);
      expect(results[0].company).toBe("Altus Healthcare");
      expect(results[1].company).toBe("Altus Healthcare");
    });

    it("should filter by account name", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("account.nameLIKEAltus Healthcare");
            
            return HttpResponse.json({ result: [mockCaseResults[0], mockCaseResults[1]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        accountName: "Altus Healthcare",
      });

      expect(results).toHaveLength(2);
    });

    it("should filter by priority", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("priority=1");
            
            return HttpResponse.json({ result: [mockCaseResults[0], mockCaseResults[2]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        priority: "1",
      });

      expect(results).toHaveLength(2);
      expect(results[0].priority).toBe("1");
      expect(results[1].priority).toBe("1");
    });

    it("should filter by state", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("state=Open");
            
            return HttpResponse.json({ result: [mockCaseResults[0], mockCaseResults[2]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        state: "Open",
      });

      expect(results).toHaveLength(2);
    });

    it("should filter by assignment group", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("assignment_group.nameLIKENetwork Operations");
            
            return HttpResponse.json({ result: [mockCaseResults[0]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        assignmentGroup: "Network Operations",
      });

      expect(results).toHaveLength(1);
    });

    it("should filter by assigned user", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("assigned_to.nameLIKEJohn Doe");
            
            return HttpResponse.json({ result: [mockCaseResults[0]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        assignedTo: "John Doe",
      });

      expect(results).toHaveLength(1);
    });

    it("should filter by keyword in short_description and description", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("short_descriptionLIKEVPN^ORdescriptionLIKEVPN");
            
            return HttpResponse.json({ result: [mockCaseResults[0], mockCaseResults[1]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        query: "VPN",
      });

      expect(results).toHaveLength(2);
      expect(results[0].short_description).toContain("VPN");
      expect(results[1].short_description).toContain("VPN");
    });

    it("should filter by opened after date", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("opened_at>2025-01-16");
            
            return HttpResponse.json({ result: [mockCaseResults[2]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        openedAfter: "2025-01-16",
      });

      expect(results).toHaveLength(1);
    });

    it("should filter by opened before date", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("opened_at<2025-01-17");
            
            return HttpResponse.json({ result: [mockCaseResults[0], mockCaseResults[1]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        openedBefore: "2025-01-17",
      });

      expect(results).toHaveLength(2);
    });

    it("should filter by active only (true)", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("active=true");
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({
        activeOnly: true,
      });
    });

    it("should filter by active only (false)", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("active=false");
            
            return HttpResponse.json({ result: [] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        activeOnly: false,
      });

      expect(results).toHaveLength(0);
    });

    it("should combine multiple filters", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("company.nameLIKEAltus");
            expect(query).toContain("priority=1");
            expect(query).toContain("active=true");
            expect(query).toContain("short_descriptionLIKEVPN^ORdescriptionLIKEVPN");
            
            return HttpResponse.json({ result: [mockCaseResults[0]] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        companyName: "Altus",
        priority: "1",
        query: "VPN",
        activeOnly: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].number).toBe("CS0001");
    });
  });

  describe("searchCustomerCases - Sorting", () => {
    it("should sort by opened_at descending by default", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("ORDERBYDESCopened_at");
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({});
    });

    it("should sort by priority descending", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("ORDERBYDESCpriority");
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({
        sortBy: "priority",
      });
    });

    it("should sort by updated_on ascending", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("ORDERBYupdated_on");
            expect(query).not.toContain("ORDERBYDESC");
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({
        sortBy: "updated_on",
        sortOrder: "asc",
      });
    });

    it("should sort by state descending", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("ORDERBYDESCstate");
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({
        sortBy: "state",
        sortOrder: "desc",
      });
    });
  });

  describe("searchCustomerCases - Edge Cases", () => {
    it("should return empty array when no results found", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          () => {
            return HttpResponse.json({ result: [] });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({
        companyName: "Nonexistent Company",
      });

      expect(results).toHaveLength(0);
    });

    it("should handle missing display values gracefully", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          () => {
            return HttpResponse.json({
              result: [
                {
                  sys_id: "case_minimal",
                  number: "CS9999",
                  // Missing optional fields
                },
              ],
            });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({});

      expect(results).toHaveLength(1);
      expect(results[0].number).toBe("CS9999");
      expect(results[0].short_description).toBeUndefined();
      expect(results[0].priority).toBeUndefined();
    });

    it("should extract values from object fields correctly", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          () => {
            return HttpResponse.json({
              result: [
                {
                  sys_id: { display_value: "case_obj_sys_id", value: "case_obj_sys_id" },
                  number: { display_value: "CS8888", value: "CS8888" },
                  short_description: { display_value: "Test case with object fields" },
                  priority: { display_value: "3" },
                  state: { display_value: "Open" },
                  account: { display_value: "Test Account" },
                  company: { display_value: "Test Company" },
                  opened_at: { display_value: "2025-01-18 10:00:00" },
                  sys_updated_on: { display_value: "2025-01-18 11:00:00" },
                },
              ],
            });
          },
        ),
      );

      const results = await serviceNowClient.searchCustomerCases({});

      expect(results).toHaveLength(1);
      expect(results[0].number).toBe("CS8888");
      expect(results[0].short_description).toBe("Test case with object fields");
      expect(results[0].priority).toBe("3");
    });
  });

  describe("searchCustomerCases - Default Behaviors", () => {
    it("should default to active cases when no filters specified", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            // Should automatically add active=true when no filters
            expect(query).toContain("active=true");
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({});
    });

    it("should not add default active filter when state is specified", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("state=Closed");
            // Should not have default active=true when state is provided
            const parts = query.split('^');
            const activeParts = parts.filter(p => p === "active=true");
            expect(activeParts.length).toBe(0);
            
            return HttpResponse.json({ result: [] });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({
        state: "Closed",
      });
    });

    it("should not add default active filter when other filters are present", async () => {
      server.use(
        http.get(
          "https://example.service-now.com/api/now/table/sn_customerservice_case",
          ({ request }) => {
            const url = new URL(request.url);
            const query = url.searchParams.get("sysparm_query") ?? "";
            
            expect(query).toContain("company.nameLIKEAltus");
            // Should not automatically add active=true when other filters present
            const parts = query.split('^');
            const activeParts = parts.filter(p => p === "active=true");
            expect(activeParts.length).toBe(0);
            
            return HttpResponse.json({ result: mockCaseResults });
          },
        ),
      );

      await serviceNowClient.searchCustomerCases({
        companyName: "Altus",
      });
    });
  });
});
