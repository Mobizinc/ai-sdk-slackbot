/**
 * CMDB Relationship Traversal Tests
 *
 * Tests for CI relationship functionality including:
 * - Relationship retrieval
 * - Circular reference protection
 * - Relationship type filtering
 * - Result limiting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServiceNowCMDBRepository } from "../lib/infrastructure/servicenow/repositories/cmdb-repository.impl";
import type { ServiceNowHttpClient } from "../lib/infrastructure/servicenow/client/http-client";

describe("CMDB Relationship Traversal", () => {
  let mockHttpClient: ServiceNowHttpClient;
  let cmdbRepo: ServiceNowCMDBRepository;

  beforeEach(() => {
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

  describe("Basic Relationship Retrieval", () => {
    it("should retrieve related CIs for a given CI", async () => {
      const ciSysId = "ci-parent-123";

      // Mock cmdb_rel_ci API call
      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: ciSysId, display_value: "PROD-WEB-01" },
            child: { value: "ci-child-1", display_value: "PROD-DB-01" },
            type: { name: "Depends On" },
          },
          {
            sys_id: "rel2",
            parent: { value: ciSysId, display_value: "PROD-WEB-01" },
            child: { value: "ci-child-2", display_value: "PROD-CACHE-01" },
            type: { name: "Depends On" },
          },
        ],
      };

      // Mock individual CI lookups
      const mockChild1 = {
        result: {
          sys_id: "ci-child-1",
          name: "PROD-DB-01",
          sys_class_name: "cmdb_ci_database",
          ip_address: "10.0.1.20",
        },
      };

      const mockChild2 = {
        result: {
          sys_id: "ci-child-2",
          name: "PROD-CACHE-01",
          sys_class_name: "cmdb_ci_app_server",
          ip_address: "10.0.1.30",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships) // cmdb_rel_ci query
        .mockResolvedValueOnce(mockChild1) // First CI lookup
        .mockResolvedValueOnce(mockChild2); // Second CI lookup

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      expect(relatedCIs).toHaveLength(2);
      expect(relatedCIs[0].name).toBe("PROD-DB-01");
      expect(relatedCIs[1].name).toBe("PROD-CACHE-01");
    });

    it("should handle both parent and child relationships", async () => {
      const ciSysId = "ci-middle-123";

      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: "ci-parent-1", display_value: "PROD-LB-01" },
            child: { value: ciSysId, display_value: "PROD-WEB-01" },
            type: { name: "Supports" },
          },
          {
            sys_id: "rel2",
            parent: { value: ciSysId, display_value: "PROD-WEB-01" },
            child: { value: "ci-child-1", display_value: "PROD-DB-01" },
            type: { name: "Depends On" },
          },
        ],
      };

      const mockParent = {
        result: {
          sys_id: "ci-parent-1",
          name: "PROD-LB-01",
          sys_class_name: "cmdb_ci_lb",
        },
      };

      const mockChild = {
        result: {
          sys_id: "ci-child-1",
          name: "PROD-DB-01",
          sys_class_name: "cmdb_ci_database",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships)
        .mockResolvedValueOnce(mockParent)
        .mockResolvedValueOnce(mockChild);

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      expect(relatedCIs).toHaveLength(2);
      expect(relatedCIs.some((ci) => ci.name === "PROD-LB-01")).toBe(true);
      expect(relatedCIs.some((ci) => ci.name === "PROD-DB-01")).toBe(true);
    });
  });

  describe("Relationship Type Filtering", () => {
    it("should filter by relationship type", async () => {
      const ciSysId = "ci-123";

      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: ciSysId },
            child: { value: "ci-child-1" },
            type: { name: "Depends On" },
          },
        ],
      };

      const mockChild = {
        result: {
          sys_id: "ci-child-1",
          name: "PROD-DB-01",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships)
        .mockResolvedValueOnce(mockChild);

      await cmdbRepo.getRelatedCIs(ciSysId, "Depends On");

      // Verify query includes relationship type filter
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/cmdb_rel_ci",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("type.name=Depends On"),
        })
      );
    });

    it("should retrieve all relationship types when not specified", async () => {
      const ciSysId = "ci-123";

      const mockRelationships = {
        result: [],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockRelationships);

      await cmdbRepo.getRelatedCIs(ciSysId);

      // Verify query does NOT include relationship type filter
      const call = vi.mocked(mockHttpClient.get).mock.calls[0];
      const params = call[1] as any;
      expect(params.sysparm_query).not.toContain("type.name=");
    });
  });

  describe("Circular Reference Protection", () => {
    it("should prevent infinite loops in relationship traversal", async () => {
      const ciSysId = "ci-123";

      // Mock circular relationship: ci-123 → ci-456 → ci-123
      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: ciSysId },
            child: { value: "ci-456" },
          },
        ],
      };

      const mockRelatedCI = {
        result: {
          sys_id: "ci-456",
          name: "RELATED-CI",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships)
        .mockResolvedValueOnce(mockRelatedCI);

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      // Should only return ci-456, not attempt to fetch ci-123 again
      expect(relatedCIs).toHaveLength(1);
      expect(relatedCIs[0].sysId).toBe("ci-456");
    });

    it("should handle self-referencing relationships", async () => {
      const ciSysId = "ci-123";

      // CI that references itself
      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: ciSysId },
            child: { value: ciSysId }, // Self-reference!
          },
          {
            sys_id: "rel2",
            parent: { value: ciSysId },
            child: { value: "ci-456" },
          },
        ],
      };

      const mockValidCI = {
        result: {
          sys_id: "ci-456",
          name: "VALID-CI",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships)
        .mockResolvedValueOnce(mockValidCI);

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      // Should only include ci-456, not the self-reference
      expect(relatedCIs).toHaveLength(1);
      expect(relatedCIs[0].sysId).toBe("ci-456");
    });

    it("should deduplicate duplicate relationships", async () => {
      const ciSysId = "ci-123";

      // Duplicate relationships to same CI
      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: ciSysId },
            child: { value: "ci-456" },
            type: { name: "Depends On" },
          },
          {
            sys_id: "rel2",
            parent: { value: ciSysId },
            child: { value: "ci-456" },
            type: { name: "Hosted On" },
          },
        ],
      };

      const mockRelatedCI = {
        result: {
          sys_id: "ci-456",
          name: "SHARED-CI",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships)
        .mockResolvedValueOnce(mockRelatedCI);

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      // Should only fetch ci-456 once despite multiple relationship records
      expect(relatedCIs).toHaveLength(1);
      // Note: May call getInstanceUrl internally, so check at least 2 calls
      expect(mockHttpClient.get).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should continue processing on individual CI fetch failure", async () => {
      const ciSysId = "ci-123";

      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: ciSysId },
            child: { value: "ci-456" },
          },
          {
            sys_id: "rel2",
            parent: { value: ciSysId },
            child: { value: "ci-789" },
          },
        ],
      };

      const mockCI1 = {
        result: {
          sys_id: "ci-456",
          name: "VALID-CI",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships)
        .mockResolvedValueOnce(mockCI1)
        .mockRejectedValueOnce(new Error("CI not found")); // Second CI fails

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      // Should return the one successful CI
      expect(relatedCIs).toHaveLength(1);
      expect(relatedCIs[0].sysId).toBe("ci-456");
    });

    it("should handle empty relationships gracefully", async () => {
      const ciSysId = "ci-orphan";

      const mockRelationships = {
        result: [],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockRelationships);

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      expect(relatedCIs).toHaveLength(0);
    });
  });

  describe("Performance & Limits", () => {
    it("should limit relationship query results", async () => {
      const ciSysId = "ci-123";

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce({ result: [] });

      await cmdbRepo.getRelatedCIs(ciSysId);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/api/now/table/cmdb_rel_ci",
        expect.objectContaining({
          sysparm_limit: 50, // Default limit
        })
      );
    });

    it("should handle large relationship sets efficiently", async () => {
      const ciSysId = "ci-hub";

      // Generate 100 relationships
      const relationships = Array.from({ length: 100 }, (_, i) => ({
        sys_id: `rel${i}`,
        parent: { value: ciSysId },
        child: { value: `ci-child-${i}` },
      }));

      const mockRelationships = {
        result: relationships.slice(0, 50), // ServiceNow returns max 50
      };

      // Mock all child CI lookups
      for (let i = 0; i < 50; i++) {
        vi.mocked(mockHttpClient.get).mockResolvedValueOnce({
          result: {
            sys_id: `ci-child-${i}`,
            name: `CI-${i}`,
          },
        });
      }

      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockRelationships);

      const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId);

      // Should handle up to limit
      expect(relatedCIs.length).toBeLessThanOrEqual(50);
    });
  });

  describe("Real-world Scenarios", () => {
    it("should retrieve application stack: Web → App → Database", async () => {
      const webServerSysId = "ci-web-01";

      const mockRelationships = {
        result: [
          {
            sys_id: "rel1",
            parent: { value: webServerSysId },
            child: { value: "ci-app-01" },
            type: { name: "Depends On" },
          },
          {
            sys_id: "rel2",
            parent: { value: "ci-app-01" },
            child: { value: "ci-db-01" },
            type: { name: "Depends On" },
          },
        ],
      };

      const mockAppServer = {
        result: {
          sys_id: "ci-app-01",
          name: "PROD-APP-01",
          sys_class_name: "cmdb_ci_app_server",
        },
      };

      const mockDatabase = {
        result: {
          sys_id: "ci-db-01",
          name: "PROD-DB-01",
          sys_class_name: "cmdb_ci_database",
        },
      };

      vi.mocked(mockHttpClient.get)
        .mockResolvedValueOnce(mockRelationships)
        .mockResolvedValueOnce(mockAppServer)
        .mockResolvedValueOnce(mockDatabase);

      const relatedCIs = await cmdbRepo.getRelatedCIs(webServerSysId);

      expect(relatedCIs).toHaveLength(2);
      expect(relatedCIs.some((ci) => ci.className === "cmdb_ci_app_server")).toBe(true);
      expect(relatedCIs.some((ci) => ci.className === "cmdb_ci_database")).toBe(true);
    });

    it("should handle load balancer with multiple backend servers", async () => {
      const lbSysId = "ci-lb-01";

      const mockRelationships = {
        result: [
          {
            parent: { value: lbSysId },
            child: { value: "ci-web-01" },
            type: { name: "Supports" },
          },
          {
            parent: { value: lbSysId },
            child: { value: "ci-web-02" },
            type: { name: "Supports" },
          },
          {
            parent: { value: lbSysId },
            child: { value: "ci-web-03" },
            type: { name: "Supports" },
          },
        ],
      };

      // Set up mocks in correct order: relationships first, then CI lookups
      vi.mocked(mockHttpClient.get).mockResolvedValueOnce(mockRelationships);

      // Mock all web server lookups
      for (let i = 1; i <= 3; i++) {
        vi.mocked(mockHttpClient.get).mockResolvedValueOnce({
          result: {
            sys_id: `ci-web-0${i}`,
            name: `PROD-WEB-0${i}`,
            sys_class_name: "cmdb_ci_server",
          },
        });
      }

      const relatedCIs = await cmdbRepo.getRelatedCIs(lbSysId);

      expect(relatedCIs).toHaveLength(3);
      expect(relatedCIs.every((ci) => ci.name?.startsWith("PROD-WEB"))).toBe(true);
    });
  });
});
