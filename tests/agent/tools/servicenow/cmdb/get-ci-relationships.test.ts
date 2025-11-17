/**
 * Unit Tests for Get CI Relationships Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGetCIRelationshipsTool } from "@/agent/tools/servicenow/cmdb/get-ci-relationships.tool";

// Mock dependencies
vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getCIRelationships: vi.fn(),
  },
}));

vi.mock("../../../../../lib/services/servicenow-formatters", () => ({
  formatConfigurationItemsForLLM: vi.fn((items) => ({
    summary: `Found ${items.length} related CIs`,
    rawData: items,
  })),
}));

import { serviceNowClient } from "@/tools/servicenow";

describe("Get CI Relationships Tool", () => {
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockRelatedCIs = () => [
    {
      sys_id: "ci-rel-1",
      name: "PROD-DB-01",
      sys_class_name: "cmdb_ci_database",
      company: "Acme Corp",
      status: "1",
      url: "https://instance.service-now.com/cmdb_ci_database.do?sys_id=ci-rel-1",
    },
    {
      sys_id: "ci-rel-2",
      name: "PROD-APP-01",
      sys_class_name: "cmdb_ci_app_server",
      company: "Acme Corp",
      status: "1",
      url: "https://instance.service-now.com/cmdb_ci_app_server.do?sys_id=ci-rel-2",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    tool = createGetCIRelationshipsTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Relationship Retrieval", () => {
    it("should retrieve all relationships for a CI", async () => {
      const mockCIs = createMockRelatedCIs();
      (serviceNowClient.getCIRelationships as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciSysId: "ci-sys-id-123" });

      expect(serviceNowClient.getCIRelationships).toHaveBeenCalledWith(
        { ciSysId: "ci-sys-id-123", relationshipType: undefined, limit: 50 },
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.data?.relatedCIs).toHaveLength(2);
      expect(result.data?.relationshipCount).toBe(2);
    });

    it("should filter by relationship type", async () => {
      const mockCIs = createMockRelatedCIs();
      (serviceNowClient.getCIRelationships as any).mockResolvedValue(mockCIs);

      await tool.execute({
        ciSysId: "ci-sys-id-123",
        relationshipType: "Depends on::Used by",
      });

      expect(serviceNowClient.getCIRelationships).toHaveBeenCalledWith(
        { ciSysId: "ci-sys-id-123", relationshipType: "Depends on::Used by", limit: 50 },
        expect.any(Object)
      );
    });

    it("should use custom limit", async () => {
      const mockCIs = createMockRelatedCIs();
      (serviceNowClient.getCIRelationships as any).mockResolvedValue(mockCIs);

      await tool.execute({ ciSysId: "ci-sys-id-123", limit: 100 });

      expect(serviceNowClient.getCIRelationships).toHaveBeenCalledWith(
        { ciSysId: "ci-sys-id-123", relationshipType: undefined, limit: 100 },
        expect.any(Object)
      );
    });

    it("should format related CIs correctly", async () => {
      const mockCIs = createMockRelatedCIs();
      (serviceNowClient.getCIRelationships as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciSysId: "ci-sys-id-123" });

      expect(result.data?.relatedCIs[0]).toMatchObject({
        sysId: "ci-rel-1",
        name: "PROD-DB-01",
        className: "cmdb_ci_database",
        company: "Acme Corp",
        status: "1",
      });
    });
  });

  describe("Empty Results", () => {
    it("should handle no relationships gracefully", async () => {
      (serviceNowClient.getCIRelationships as any).mockResolvedValue([]);

      const result = await tool.execute({ ciSysId: "ci-sys-id-123" });

      expect(result.success).toBe(true);
      expect(result.data?.relationshipCount).toBe(0);
      expect(result.data?.message).toContain("No related CIs found");
    });

    it("should suggest removing filter when no results with type filter", async () => {
      (serviceNowClient.getCIRelationships as any).mockResolvedValue([]);

      const result = await tool.execute({
        ciSysId: "ci-sys-id-123",
        relationshipType: "NonExistent::Type",
      });

      expect(result.data?.message).toContain("Try searching without a relationship type filter");
    });
  });

  describe("Error Handling", () => {
    it("should handle errors gracefully", async () => {
      (serviceNowClient.getCIRelationships as any).mockRejectedValue(
        new Error("CMDB service error")
      );

      const result = await tool.execute({ ciSysId: "ci-sys-id-123" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("CMDB service error");
    });
  });

  describe("Limit Handling", () => {
    it("should indicate when limit is reached", async () => {
      const mockCIs = Array(50).fill(null).map((_, i) => ({
        sys_id: `ci-rel-${i}`,
        name: `CI-${i}`,
        sys_class_name: "cmdb_ci",
        url: `https://instance.service-now.com/cmdb_ci.do?sys_id=ci-rel-${i}`,
      }));
      (serviceNowClient.getCIRelationships as any).mockResolvedValue(mockCIs);

      const result = await tool.execute({ ciSysId: "ci-sys-id-123", limit: 50 });

      expect(result.data?.message).toContain("limit reached");
    });
  });
});
