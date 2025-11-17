/**
 * Unit Tests for Search Configuration Items Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSearchConfigurationItemsTool } from "../../../../../lib/agent/tools/servicenow/cmdb/search-configuration-items.tool";

// Mock dependencies
vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getCaseRepository: vi.fn(),
  getIncidentRepository: vi.fn(),
  getCmdbRepository: vi.fn(() => mockCmdbRepo),
}));

const mockCmdbRepo = {
  search: vi.fn(),
};

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getCaseJournal: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getCaseRepository: vi.fn(),
  getIncidentRepository: vi.fn(),
  getCmdbRepository: vi.fn(() => ({
    search: vi.fn(),
  })),
}));

vi.mock("../../../../../lib/services/servicenow-formatters", () => ({
  formatConfigurationItemsForLLM: vi.fn((items) => items),
  fetchAttachments: vi.fn(() => Promise.resolve([])),
  extractReference: vi.fn((value) => value),
}));

import { serviceNowClient } from "../../../../lib/tools/servicenow";
import { formatConfigurationItemsForLLM } from "../../../../lib/services/servicenow-formatters";

describe("Search Configuration Items Tool", () => {
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockCIs = () => [
    {
      sysId: "ci-sys-id-1",
      name: "PROD-WEB-01",
      className: "cmdb_ci_server",
      fqdn: "prod-web-01.example.com",
      hostName: "prod-web-01",
      ipAddresses: ["10.0.1.10", "10.0.1.11"],
      company: "Acme Corp",
      companyName: "Acme Corporation",
      ownerGroup: "Platform Team",
      supportGroup: "IT Support",
      location: "Data Center 1",
      environment: "production",
      status: "1",
      description: "Production web server",
      url: "https://instance.service-now.com/cmdb_ci_server.do?sys_id=ci-sys-id-1",
    },
    {
      sysId: "ci-sys-id-2",
      name: "PROD-WEB-02",
      className: "cmdb_ci_server",
      fqdn: "prod-web-02.example.com",
      hostName: "prod-web-02",
      ipAddresses: ["10.0.1.20"],
      company: "Acme Corp",
      companyName: "Acme Corporation",
      ownerGroup: "Platform Team",
      supportGroup: "IT Support",
      location: "Data Center 1",
      environment: "production",
      status: "1",
      description: "Production web server",
      url: "https://instance.service-now.com/cmdb_ci_server.do?sys_id=ci-sys-id-2",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    tool = createSearchConfigurationItemsTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful CI Search", () => {
     it("should search CIs by name", async () => {
      const mockCIs = createMockCIs();
      mockCmdbRepo.search.mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciName: "PROD-WEB" });

      expect(mockCmdbRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ name: "PROD-WEB", limit: 10 }),
        expect.any(Object)
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining('is searching configuration items (name="PROD-WEB")')
      );
      expect(result.success).toBe(true);
      expect(result.data?.configurationItems).toHaveLength(2);
    });

    it("should search CIs by IP address", async () => {
      const mockCIs = [createMockCIs()[0]];
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ipAddress: "10.0.1.10" });

      expect(serviceNowClient.searchConfigurationItems).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: "10.0.1.10" }),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.data?.configurationItems[0].ipAddresses).toContain("10.0.1.10");
    });

    it("should search CIs by className", async () => {
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciClassName: "cmdb_ci_server" });

      expect(serviceNowClient.searchConfigurationItems).toHaveBeenCalledWith(
        expect.objectContaining({ className: "cmdb_ci_server" }),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it("should search CIs with multiple criteria", async () => {
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({
        companyName: "Acme",
        ciEnvironment: "production",
        ciClassName: "cmdb_ci_server",
      });

      expect(serviceNowClient.searchConfigurationItems).toHaveBeenCalledWith(
        expect.objectContaining({
          company: "Acme",
          environment: "production",
          className: "cmdb_ci_server",
        }),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it("should format CI results correctly", async () => {
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciName: "PROD-WEB-01" });

      expect(result.success).toBe(true);
      expect(result.data?.configurationItems[0]).toMatchObject({
        sysId: "ci-sys-id-1",
        name: "PROD-WEB-01",
        className: "cmdb_ci_server",
        ipAddresses: ["10.0.1.10", "10.0.1.11"],
        company: "Acme Corp",
        ownerGroup: "Platform Team",
        environment: "production",
        status: "1",
      });
    });
  });

  describe("Input Validation", () => {
    it("should return error when no search criteria provided", async () => {
      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("At least one search criterion must be provided");
    });

    it("should accept any single criterion", async () => {
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      const criteriaTests = [
        { ciName: "test" },
        { ipAddress: "10.0.0.1" },
        { ciSysId: "sys-id-123" },
        { ciClassName: "cmdb_ci_server" },
        { companyName: "Acme" },
        { ciLocation: "Chicago" },
        { ciOwnerGroup: "Platform" },
        { ciEnvironment: "production" },
        { ciOperationalStatus: "1" },
      ];

      for (const criteria of criteriaTests) {
        const result = await tool.execute(criteria);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Empty Results", () => {
    it("should handle no results gracefully", async () => {
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue([]);

      const result = await tool.execute({ ciName: "nonexistent" });

      expect(result.success).toBe(true);
      expect(result.data?.configurationItems).toEqual([]);
      expect(result.data?.totalFound).toBe(0);
      expect(result.data?.message).toContain("No configuration items found");
    });
  });

  describe("Limit Handling", () => {
    it("should use default limit of 10", async () => {
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      await tool.execute({ ciName: "PROD-WEB" });

      expect(serviceNowClient.searchConfigurationItems).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
        expect.any(Object)
      );
    });

    it("should use custom limit when provided", async () => {
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      await tool.execute({ ciName: "PROD-WEB", limit: 25 });

      expect(serviceNowClient.searchConfigurationItems).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 }),
        expect.any(Object)
      );
    });

    it("should indicate when limit is reached", async () => {
      const mockCIs = Array(10).fill(null).map((_, i) => ({
        ...createMockCIs()[0],
        sys_id: `ci-sys-id-${i}`,
        name: `PROD-WEB-${String(i).padStart(2, "0")}`,
      }));
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciClassName: "cmdb_ci_server", limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data?.totalFound).toBe(10);
      expect(result.data?.message).toContain("limit reached");
    });
  });

  describe("Formatted Summary", () => {
    it("should include formatted summary in result", async () => {
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciName: "PROD-WEB" });

      expect(formatConfigurationItemsForLLM).toHaveBeenCalledWith(mockCIs);
      expect(result.success).toBe(true);
      expect(result.data?.summary).toBe("Found 2 CIs");
      expect(result.data?.rawData).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle search errors gracefully", async () => {
      (serviceNowClient.searchConfigurationItems as any).mockRejectedValue(
        new Error("CMDB service unavailable")
      );

      const result = await tool.execute({ ciName: "PROD-WEB" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("CMDB service unavailable");
    });

    it("should handle unknown errors", async () => {
      (serviceNowClient.searchConfigurationItems as any).mockRejectedValue("Unknown error");

      const result = await tool.execute({ ciName: "PROD-WEB" });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Failed to search configuration items in ServiceNow");
    });
  });

  describe("Logging", () => {
    it("should log search activity", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockCIs = createMockCIs();
      (serviceNowClient.searchConfigurationItems as any).mockResolvedValue(mockCIs);

      await tool.execute({ ciName: "PROD-WEB", ciEnvironment: "production" });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[search_configuration_items] Searching CIs: name="PROD-WEB", env="production"')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[search_configuration_items] Found 2 CIs")
      );

      consoleLogSpy.mockRestore();
    });
  });
});
