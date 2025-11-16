/**
 * Unit Tests for Request Repository
 *
 * Tests core retrieval methods for ServiceNow Request (sc_request) records
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ServiceNowRequestRepository } from "../../../../../lib/infrastructure/servicenow/repositories/request-repository.impl";
import type { ServiceNowHttpClient } from "../../../../../lib/infrastructure/servicenow/client/http-client";
import type { RequestRecord } from "../../../../../lib/infrastructure/servicenow/types/api-responses";
import { ServiceNowNotFoundError } from "../../../../../lib/infrastructure/servicenow/errors";

describe("ServiceNowRequestRepository", () => {
  let mockHttpClient: ServiceNowHttpClient;
  let repository: ServiceNowRequestRepository;

  const mockRequestRecord: RequestRecord = {
    sys_id: "req123456",
    number: "REQ0043549",
    short_description: "Network Access Request",
    description: "Request for VPN access",
    requested_for: { value: "user123", display_value: "John Doe" },
    requested_by: { value: "user456", display_value: "Jane Smith" },
    state: { value: "in_progress", display_value: "In Progress" },
    priority: { value: "3", display_value: "3 - Moderate" },
    opened_at: "2025-01-15 10:00:00",
    closed_at: undefined,
    due_date: "2025-01-20 17:00:00",
    stage: { value: "fulfillment", display_value: "Fulfillment" },
    approval: { value: "approved", display_value: "Approved" },
    delivery_address: { value: "", display_value: "" },
    special_instructions: { value: "", display_value: "" },
    price: { value: "0", display_value: "0" },
  };

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      getInstanceUrl: vi.fn().mockReturnValue("https://example.service-now.com"),
    } as any;

    repository = new ServiceNowRequestRepository(mockHttpClient);
  });

  describe("findByNumber", () => {
    it("should fetch request by number", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestRecord],
      });

      const request = await repository.findByNumber("REQ0043549");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_request",
        expect.objectContaining({
          sysparm_query: "number=REQ0043549",
          sysparm_limit: 1,
          sysparm_display_value: "all",
        })
      );

      expect(request).not.toBeNull();
      expect(request?.number).toBe("REQ0043549");
      expect(request?.shortDescription).toBe("Network Access Request");
    });

    it("should return null if request not found", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [],
      });

      const request = await repository.findByNumber("REQ9999999");

      expect(request).toBeNull();
    });

    it("should map all fields correctly", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestRecord],
      });

      const request = await repository.findByNumber("REQ0043549");

      expect(request).toMatchObject({
        sysId: "req123456",
        number: "REQ0043549",
        shortDescription: "Network Access Request",
        requestedForName: "John Doe",
        requestedByName: "Jane Smith",
        state: "In Progress",
        priority: "3 - Moderate",
      });
    });
  });

  describe("findBySysId", () => {
    it("should fetch request by sys_id", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: mockRequestRecord,
      });

      const request = await repository.findBySysId("req123456");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_request/req123456",
        expect.objectContaining({
          sysparm_display_value: "all",
        })
      );

      expect(request).not.toBeNull();
      expect(request?.sysId).toBe("req123456");
    });

    it("should return null on 404 error", async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new ServiceNowNotFoundError("Not found"));

      const request = await repository.findBySysId("invalid_id");

      expect(request).toBeNull();
    });

    it("should throw on other errors", async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error("Network error"));

      await expect(repository.findBySysId("req123456")).rejects.toThrow("Network error");
    });
  });

  describe("search", () => {
    it("should search requests with criteria", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestRecord],
        headers: { "x-total-count": "1" },
      });

      const result = await repository.search({
        state: "in_progress",
        limit: 10,
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_request",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("state=in_progress"),
          sysparm_limit: 10,
        })
      );

      expect(result.requests).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });

    it("should build complex queries", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [],
      });

      await repository.search({
        state: "in_progress",
        priority: "3",
        openedAfter: new Date("2025-01-01"),
        sortBy: "opened_at",
        sortOrder: "desc",
      });

      const call = vi.mocked(mockHttpClient.get).mock.calls[0];
      const params = call[1] as Record<string, any>;

      expect(params.sysparm_query).toContain("state=in_progress");
      expect(params.sysparm_query).toContain("priority=3");
      expect(params.sysparm_query).toContain("opened_at>=");
    });
  });

  describe("findByRequestedFor", () => {
    it("should fetch requests for specific user", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestRecord],
      });

      const requests = await repository.findByRequestedFor("user123", 5);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_request",
        expect.objectContaining({
          sysparm_query: "requested_for=user123",
          sysparm_limit: 5,
        })
      );

      expect(requests).toHaveLength(1);
    });
  });

  describe("findByState", () => {
    it("should fetch requests by state", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestRecord],
      });

      const requests = await repository.findByState("in_progress");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_request",
        expect.objectContaining({
          sysparm_query: "state=in_progress",
        })
      );

      expect(requests).toHaveLength(1);
    });
  });
});
