/**
 * Unit Tests for Requested Item Repository
 *
 * Tests core retrieval methods for ServiceNow RequestedItem (sc_req_item) records
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ServiceNowRequestedItemRepository } from "../../../../../lib/infrastructure/servicenow/repositories/requested-item-repository.impl";
import type { ServiceNowHttpClient } from "../../../../../lib/infrastructure/servicenow/client/http-client";
import type { RequestedItemRecord } from "../../../../../lib/infrastructure/servicenow/types/api-responses";
import { ServiceNowNotFoundError } from "../../../../../lib/infrastructure/servicenow/errors";

describe("ServiceNowRequestedItemRepository", () => {
  let mockHttpClient: ServiceNowHttpClient;
  let repository: ServiceNowRequestedItemRepository;

  const mockRequestedItemRecord: RequestedItemRecord = {
    sys_id: "ritm123456",
    number: "RITM0046210",
    short_description: "VPN Access Setup",
    description: "Configure VPN access for remote work",
    request: { value: "req123456", display_value: "REQ0043549" },
    cat_item: { value: "cat123", display_value: "VPN Access License" },
    state: { value: "in_progress", display_value: "Work in Progress" },
    stage: { value: "fulfillment", display_value: "Fulfillment" },
    opened_at: "2025-01-15 10:30:00",
    closed_at: undefined,
    due_date: "2025-01-18 17:00:00",
    assigned_to: { value: "user789", display_value: "Bob Johnson" },
    assignment_group: { value: "group123", display_value: "IT Support" },
    quantity: { value: "1", display_value: "1" },
    price: { value: "0", display_value: "0" },
  };

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      getInstanceUrl: vi.fn().mockReturnValue("https://example.service-now.com"),
    } as any;

    repository = new ServiceNowRequestedItemRepository(mockHttpClient);
  });

  describe("findByNumber", () => {
    it("should fetch requested item by number", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestedItemRecord],
      });

      const ritm = await repository.findByNumber("RITM0046210");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_req_item",
        expect.objectContaining({
          sysparm_query: "number=RITM0046210",
          sysparm_limit: 1,
          sysparm_display_value: "all",
        })
      );

      expect(ritm).not.toBeNull();
      expect(ritm?.number).toBe("RITM0046210");
      expect(ritm?.shortDescription).toBe("VPN Access Setup");
      expect(ritm?.requestNumber).toBe("REQ0043549");
    });

    it("should return null if not found", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [],
      });

      const ritm = await repository.findByNumber("RITM9999999");

      expect(ritm).toBeNull();
    });

    it("should map parent relationship correctly", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestedItemRecord],
      });

      const ritm = await repository.findByNumber("RITM0046210");

      expect(ritm?.request).toBe("req123456");
      expect(ritm?.requestNumber).toBe("REQ0043549");
    });
  });

  describe("findBySysId", () => {
    it("should fetch requested item by sys_id", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: mockRequestedItemRecord,
      });

      const ritm = await repository.findBySysId("ritm123456");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_req_item/ritm123456",
        expect.objectContaining({
          sysparm_display_value: "all",
        })
      );

      expect(ritm).not.toBeNull();
      expect(ritm?.sysId).toBe("ritm123456");
    });

    it("should return null on 404 error", async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new ServiceNowNotFoundError("Not found"));

      const ritm = await repository.findBySysId("invalid_id");

      expect(ritm).toBeNull();
    });
  });

  describe("findByRequest", () => {
    it("should fetch items for a parent request", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestedItemRecord],
      });

      const items = await repository.findByRequest("req123456", 5);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_req_item",
        expect.objectContaining({
          sysparm_query: "request=req123456",
          sysparm_limit: 5,
        })
      );

      expect(items).toHaveLength(1);
      expect(items[0].request).toBe("req123456");
    });
  });

  describe("findByCatalogItem", () => {
    it("should fetch items by catalog item", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestedItemRecord],
      });

      const items = await repository.findByCatalogItem("cat123");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_req_item",
        expect.objectContaining({
          sysparm_query: "cat_item=cat123",
        })
      );

      expect(items).toHaveLength(1);
    });
  });

  describe("search", () => {
    it("should search with multiple criteria", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockRequestedItemRecord],
        headers: { "x-total-count": "1" },
      });

      const result = await repository.search({
        state: "in_progress",
        request: "req123456",
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });
  });
});
