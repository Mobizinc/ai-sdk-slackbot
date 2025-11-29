/**
 * Unit Tests for Catalog Task Repository
 *
 * Tests core retrieval methods for ServiceNow CatalogTask (sc_task) records
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ServiceNowCatalogTaskRepository } from "../../../../../lib/infrastructure/servicenow/repositories/catalog-task-repository.impl";
import type { ServiceNowHttpClient } from "../../../../../lib/infrastructure/servicenow/client/http-client";
import type { CatalogTaskRecord } from "../../../../../lib/infrastructure/servicenow/types/api-responses";
import { ServiceNowNotFoundError } from "../../../../../lib/infrastructure/servicenow/errors";

describe("ServiceNowCatalogTaskRepository", () => {
  let mockHttpClient: ServiceNowHttpClient;
  let repository: ServiceNowCatalogTaskRepository;

  const mockCatalogTaskRecord: CatalogTaskRecord = {
    sys_id: "ctask123456",
    number: "CTASK0049921",
    short_description: "Configure VPN Client",
    description: "Install and configure VPN client software",
    request_item: { value: "ritm123456", display_value: "RITM0046210" },
    request: { value: "req123456", display_value: "REQ0043549" },
    state: { value: "open", display_value: "Open" },
    active: { value: "true", display_value: "true" },
    opened_at: "2025-01-15 11:00:00",
    closed_at: undefined,
    due_date: "2025-01-17 17:00:00",
    assigned_to: { value: "user999", display_value: "Alice Brown" },
    assignment_group: { value: "group456", display_value: "Desktop Support" },
    priority: { value: "3", display_value: "3 - Moderate" },
    work_notes: { value: "Initial setup in progress", display_value: "Initial setup in progress" },
    close_notes: { value: "", display_value: "" },
  };

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      getInstanceUrl: vi.fn().mockReturnValue("https://example.service-now.com"),
    } as any;

    repository = new ServiceNowCatalogTaskRepository(mockHttpClient);
  });

  describe("findByNumber", () => {
    it("should fetch catalog task by number", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
      });

      const ctask = await repository.findByNumber("CTASK0049921");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_task",
        expect.objectContaining({
          sysparm_query: "number=CTASK0049921",
          sysparm_limit: 1,
          sysparm_display_value: "all",
        })
      );

      expect(ctask).not.toBeNull();
      expect(ctask?.number).toBe("CTASK0049921");
      expect(ctask?.shortDescription).toBe("Configure VPN Client");
      expect(ctask?.requestItemNumber).toBe("RITM0046210");
      expect(ctask?.requestNumber).toBe("REQ0043549");
    });

    it("should return null if not found", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [],
      });

      const ctask = await repository.findByNumber("CTASK9999999");

      expect(ctask).toBeNull();
    });

    it("should map parent relationships correctly", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
      });

      const ctask = await repository.findByNumber("CTASK0049921");

      expect(ctask?.requestItem).toBe("ritm123456");
      expect(ctask?.requestItemNumber).toBe("RITM0046210");
      expect(ctask?.request).toBe("req123456");
      expect(ctask?.requestNumber).toBe("REQ0043549");
    });

    it("should map active field correctly", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
      });

      const ctask = await repository.findByNumber("CTASK0049921");

      expect(ctask?.active).toBe(true);
    });
  });

  describe("findBySysId", () => {
    it("should fetch catalog task by sys_id", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: mockCatalogTaskRecord,
      });

      const ctask = await repository.findBySysId("ctask123456");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_task/ctask123456",
        expect.objectContaining({
          sysparm_display_value: "all",
        })
      );

      expect(ctask).not.toBeNull();
      expect(ctask?.sysId).toBe("ctask123456");
    });

    it("should return null on 404 error", async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new ServiceNowNotFoundError("Not found"));

      const ctask = await repository.findBySysId("invalid_id");

      expect(ctask).toBeNull();
    });
  });

  describe("findByRequestedItem", () => {
    it("should fetch tasks for a parent RITM", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
      });

      const tasks = await repository.findByRequestedItem("ritm123456", 5);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_task",
        expect.objectContaining({
          sysparm_query: "request_item=ritm123456",
          sysparm_limit: 5,
        })
      );

      expect(tasks).toHaveLength(1);
      expect(tasks[0].requestItem).toBe("ritm123456");
    });
  });

  describe("findByRequest", () => {
    it("should fetch tasks for a grandparent REQ", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
      });

      const tasks = await repository.findByRequest("req123456");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_task",
        expect.objectContaining({
          sysparm_query: "request=req123456",
        })
      );

      expect(tasks).toHaveLength(1);
      expect(tasks[0].request).toBe("req123456");
    });
  });

  describe("findActive", () => {
    it("should fetch only active catalog tasks", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
      });

      const tasks = await repository.findActive(10);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_task",
        expect.objectContaining({
          sysparm_query: "active=true",
          sysparm_limit: 10,
        })
      );

      expect(tasks).toHaveLength(1);
    });
  });

  describe("search", () => {
    it("should search with multiple criteria", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
        headers: { "x-total-count": "1" },
      });

      const result = await repository.search({
        state: "open",
        requestItem: "ritm123456",
        active: true,
        limit: 10,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });

    it("should build query with request filter", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [],
      });

      await repository.search({
        request: "req123456",
      });

      const call = vi.mocked(mockHttpClient.get).mock.calls[0];
      const params = call[1] as Record<string, any>;

      expect(params.sysparm_query).toContain("request=req123456");
    });
  });

  describe("findByState", () => {
    it("should fetch tasks by state", async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        result: [mockCatalogTaskRecord],
      });

      const tasks = await repository.findByState("open");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/sc_task",
        expect.objectContaining({
          sysparm_query: "state=open",
        })
      );

      expect(tasks).toHaveLength(1);
    });
  });
});
