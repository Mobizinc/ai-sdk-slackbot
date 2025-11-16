/**
 * Integration Tests for Catalog Workflow Retrieval
 *
 * Tests actual ServiceNow API calls for REQ/RITM/CTASK records
 * Uses real sample records: REQ0043549, RITM0046210, CTASK0049921
 *
 * Run with: pnpm test tests/integration/catalog-workflow-retrieval.integration.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  getRequestRepository,
  getRequestedItemRepository,
  getCatalogTaskRepository,
} from "../../lib/infrastructure/servicenow/repositories/factory";

describe("Catalog Workflow Retrieval - Integration Tests", () => {
  describe("Request Repository - REQ0043549", () => {
    it("should retrieve Request by number", async () => {
      const repo = getRequestRepository();
      const request = await repo.findByNumber("REQ0043549");

      expect(request).toBeDefined();
      if (request) {
        expect(request.number).toBe("REQ0043549");
        expect(request.sysId).toBeDefined();
        expect(request.shortDescription).toBeDefined();
        expect(request.state).toBeDefined();
        expect(request.url).toContain("sc_request");
        console.log("✓ Request retrieved:", {
          number: request.number,
          description: request.shortDescription,
          state: request.state,
          requestedFor: request.requestedForName,
        });
      }
    }, 30000);

    it("should handle non-existent request number", async () => {
      const repo = getRequestRepository();
      const request = await repo.findByNumber("REQ9999999");

      expect(request).toBeNull();
    }, 30000);
  });

  describe("Requested Item Repository - RITM0046210", () => {
    it("should retrieve Requested Item by number", async () => {
      const repo = getRequestedItemRepository();
      const ritm = await repo.findByNumber("RITM0046210");

      expect(ritm).toBeDefined();
      if (ritm) {
        expect(ritm.number).toBe("RITM0046210");
        expect(ritm.sysId).toBeDefined();
        expect(ritm.shortDescription).toBeDefined();
        expect(ritm.state).toBeDefined();
        expect(ritm.url).toContain("sc_req_item");
        console.log("✓ Requested Item retrieved:", {
          number: ritm.number,
          description: ritm.shortDescription,
          state: ritm.state,
          parentRequest: ritm.requestNumber,
          catalogItem: ritm.catalogItemName,
        });
      }
    }, 30000);

    it("should resolve parent request relationship", async () => {
      const repo = getRequestedItemRepository();
      const ritm = await repo.findByNumber("RITM0046210");

      if (ritm && ritm.request) {
        const requestRepo = getRequestRepository();
        const parentRequest = await requestRepo.findBySysId(ritm.request);

        expect(parentRequest).toBeDefined();
        if (parentRequest) {
          console.log("✓ Parent Request resolved:", {
            number: parentRequest.number,
            description: parentRequest.shortDescription,
          });
        }
      }
    }, 30000);
  });

  describe("Catalog Task Repository - CTASK0049921", () => {
    it("should retrieve Catalog Task by number", async () => {
      const repo = getCatalogTaskRepository();
      const ctask = await repo.findByNumber("CTASK0049921");

      expect(ctask).toBeDefined();
      if (ctask) {
        expect(ctask.number).toBe("CTASK0049921");
        expect(ctask.sysId).toBeDefined();
        expect(ctask.shortDescription).toBeDefined();
        expect(ctask.state).toBeDefined();
        expect(ctask.url).toContain("sc_task");
        console.log("✓ Catalog Task retrieved:", {
          number: ctask.number,
          description: ctask.shortDescription,
          state: ctask.state,
          active: ctask.active,
          parentRITM: ctask.requestItemNumber,
          grandparentREQ: ctask.requestNumber,
        });
      }
    }, 30000);

    it("should resolve complete parent-child hierarchy", async () => {
      const ctaskRepo = getCatalogTaskRepository();
      const ctask = await ctaskRepo.findByNumber("CTASK0049921");

      if (ctask) {
        let parentRITM = null;
        let grandparentREQ = null;

        // Fetch parent RITM
        if (ctask.requestItem) {
          const ritmRepo = getRequestedItemRepository();
          parentRITM = await ritmRepo.findBySysId(ctask.requestItem);
          expect(parentRITM).toBeDefined();

          if (parentRITM) {
            console.log("✓ Parent RITM resolved:", {
              number: parentRITM.number,
              description: parentRITM.shortDescription,
            });

            // Fetch grandparent REQ
            if (parentRITM.request) {
              const requestRepo = getRequestRepository();
              grandparentREQ = await requestRepo.findBySysId(parentRITM.request);
              expect(grandparentREQ).toBeDefined();

              if (grandparentREQ) {
                console.log("✓ Grandparent REQ resolved:", {
                  number: grandparentREQ.number,
                  description: grandparentREQ.shortDescription,
                });
              }
            }
          }
        }

        console.log("\n✓ Complete hierarchy resolved:");
        console.log(`  REQ: ${grandparentREQ?.number || "N/A"} → RITM: ${parentRITM?.number || "N/A"} → CTASK: ${ctask.number}`);
      }
    }, 30000);

    it("should find active catalog tasks", async () => {
      const repo = getCatalogTaskRepository();
      const activeTasks = await repo.findActive(5);

      expect(Array.isArray(activeTasks)).toBe(true);
      if (activeTasks.length > 0) {
        console.log(`✓ Found ${activeTasks.length} active catalog tasks`);
        activeTasks.forEach((task) => {
          expect(task.active).toBe(true);
        });
      }
    }, 30000);
  });

  describe("Search Operations", () => {
    it("should search requests by state", async () => {
      const repo = getRequestRepository();
      const result = await repo.search({
        state: "in_progress",
        limit: 3,
      });

      expect(result.requests).toBeDefined();
      expect(Array.isArray(result.requests)).toBe(true);
      expect(result.totalCount).toBeGreaterThanOrEqual(0);

      if (result.requests.length > 0) {
        console.log(`✓ Found ${result.totalCount} requests in progress`);
      }
    }, 30000);

    it("should search requested items by catalog item", async () => {
      const repo = getRequestedItemRepository();
      const ritm = await repo.findByNumber("RITM0046210");

      if (ritm && ritm.catalogItem) {
        const result = await repo.findByCatalogItem(ritm.catalogItem, 3);

        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
          console.log(`✓ Found ${result.length} items for catalog item:`, ritm.catalogItemName);
        }
      }
    }, 30000);
  });
});
