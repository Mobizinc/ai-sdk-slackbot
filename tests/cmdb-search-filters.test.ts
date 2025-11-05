/**
 * CMDB Search Filters Unit Tests
 *
 * Tests for new CMDB CI search filter functionality including:
 * - className, operationalStatus, location, ownerGroup, environment filters
 * - Query validation and guards
 * - Result limiting and pagination
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServiceNowCMDBRepository } from "../lib/infrastructure/servicenow/repositories/cmdb-repository.impl";
import type { ServiceNowHttpClient } from "../lib/infrastructure/servicenow/client/http-client";
import type { CISearchCriteria } from "../lib/infrastructure/servicenow/types/domain-models";

describe("CMDB Search Filters", () => {
  let mockHttpClient: ServiceNowHttpClient;
  let cmdbRepo: ServiceNowCMDBRepository;

  beforeEach(() => {
    // Mock HTTP client
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getInstanceUrl: vi.fn(() => "https://test.service-now.com"),
    } as unknown as ServiceNowHttpClient;

    cmdbRepo = new ServiceNowCMDBRepository(mockHttpClient);
  });

  describe("Filter Parameter Support", () => {
    it("should filter by className", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "PROD-WEB-01",
            sys_class_name: "cmdb_ci_server",
            ip_address: "10.0.1.10",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        className: "cmdb_ci_server",
        limit: 10,
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/cmdb_ci",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("sys_class_name=cmdb_ci_server"),
          sysparm_limit: 10,
        })
      );
    });

    it("should filter by operationalStatus", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "PROD-WEB-01",
            operational_status: "1",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        name: "PROD",
        operationalStatus: "1",
        limit: 10,
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/cmdb_ci",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("operational_status=1"),
        })
      );
    });

    it("should filter by location", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "CHI-DC-SERVER-01",
            location: "Chicago Datacenter",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        location: "Chicago",
        limit: 10,
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/cmdb_ci",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("location LIKE Chicago"),
        })
      );
    });

    it("should filter by ownerGroup", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "PROD-WEB-01",
            owner: "Platform Team",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        name: "PROD",
        ownerGroup: "Platform",
        limit: 10,
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/cmdb_ci",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("owner=Platform"),
        })
      );
    });

    it("should filter by environment", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "PROD-WEB-01",
            u_environment: "production",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        environment: "production",
        limit: 10,
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/cmdb_ci",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("u_environment=production"),
        })
      );
    });

    it("should combine multiple filters", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "PROD-WEB-01",
            sys_class_name: "cmdb_ci_server",
            u_environment: "production",
            operational_status: "1",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        className: "cmdb_ci_server",
        environment: "production",
        operationalStatus: "1",
        limit: 10,
      };

      await cmdbRepo.search(criteria);

      const call = vi.mocked(mockHttpClient.get).mock.calls[0];
      const queryParams = call[1] as any;
      const query = queryParams.sysparm_query;

      expect(query).toContain("sys_class_name=cmdb_ci_server");
      expect(query).toContain("u_environment=production");
      expect(query).toContain("operational_status=1");
    });
  });

  describe("Query Validation", () => {
    it("should throw error when no search criteria provided", async () => {
      const criteria: CISearchCriteria = {
        limit: 10,
      };

      await expect(cmdbRepo.search(criteria)).rejects.toThrow(
        "At least one search criterion must be provided"
      );
    });

    it("should allow search with only className", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "SERVER-01",
            sys_class_name: "cmdb_ci_server",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        className: "cmdb_ci_server",
        limit: 10,
      };

      const result = await cmdbRepo.search(criteria);

      expect(result).toHaveLength(1);
      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should allow search with only location", async () => {
      const mockResponse = {
        result: [],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        location: "Chicago",
        limit: 10,
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalled();
    });
  });

  describe("Result Limiting", () => {
    it("should default to 10 results when limit not specified", async () => {
      const mockResponse = {
        result: [],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        name: "PROD",
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sysparm_limit: 10,
        })
      );
    });

    it("should enforce maximum limit of 50", async () => {
      const mockResponse = {
        result: [],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        name: "PROD",
        limit: 200, // Exceeds max
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sysparm_limit: 50, // Capped at 50
        })
      );
    });

    it("should respect custom limit within bounds", async () => {
      const mockResponse = {
        result: [],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        name: "PROD",
        limit: 25,
      };

      await cmdbRepo.search(criteria);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sysparm_limit: 25,
        })
      );
    });
  });

  describe("Real-world Query Scenarios", () => {
    it("should handle query: 'production servers'", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "PROD-WEB-01",
            sys_class_name: "cmdb_ci_server",
            u_environment: "production",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      // Simulates LLM extracting: environment='production', className='cmdb_ci_server'
      const criteria: CISearchCriteria = {
        environment: "production",
        className: "cmdb_ci_server",
        limit: 10,
      };

      const result = await cmdbRepo.search(criteria);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("PROD-WEB-01");
    });

    it("should handle query: 'CIs in Chicago'", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "CHI-SERVER-01",
            location: "Chicago Datacenter",
          },
          {
            sys_id: "ci2",
            name: "CHI-SWITCH-01",
            location: "Chicago - Network Room",
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        location: "Chicago",
        limit: 10,
      };

      const result = await cmdbRepo.search(criteria);

      expect(result).toHaveLength(2);
      expect(result.every((ci) => ci.location?.includes("Chicago"))).toBe(true);
    });

    it("should handle query: 'non-operational devices'", async () => {
      const mockResponse = {
        result: [
          {
            sys_id: "ci1",
            name: "FAILED-SERVER-01",
            operational_status: "2", // Non-operational
          },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockResponse);

      const criteria: CISearchCriteria = {
        operationalStatus: "2",
        limit: 10,
      };

      const result = await cmdbRepo.search(criteria);

      expect(result).toHaveLength(1);
    });
  });
});
