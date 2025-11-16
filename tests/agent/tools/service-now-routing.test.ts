/**
 * Unit Tests for ServiceNow Tool Routing Logic
 *
 * Tests the routing logic in service-now.ts that detects prefixes
 * and routes to the correct methods (getRequest, getRequestedItem, getCatalogTask)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, RequestedItem, CatalogTask } from "../../../lib/infrastructure/servicenow/types";

// Mock the serviceNowClient before importing the tool
vi.mock("../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    isConfigured: vi.fn(() => true),
    getCase: vi.fn(),
    getIncident: vi.fn(),
    getRequest: vi.fn(),
    getRequestedItem: vi.fn(),
    getCatalogTask: vi.fn(),
    getCaseJournal: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock("../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ userId: undefined, channelId: "C123456" })),
}));

describe("ServiceNow Tool Routing Logic", () => {
  let mockServiceNowClient: any;
  let serviceNowTool: any;

  const mockRequest: Request = {
    sysId: "req123456",
    number: "REQ0043549",
    shortDescription: "VPN Access Request",
    description: "Request for VPN access",
    requestedForName: "John Doe",
    requestedByName: "Jane Smith",
    state: "In Progress",
    priority: "3 - Moderate",
    url: "https://mobiz.service-now.com/nav_to.do?uri=sc_request.do?sys_id=req123456",
  };

  const mockRequestedItem: RequestedItem = {
    sysId: "ritm987654",
    number: "RITM0046210",
    shortDescription: "Software License",
    requestNumber: "REQ0043549",
    catalogItemName: "Adobe Creative Cloud",
    state: "Work in Progress",
    assignedToName: "Bob Johnson",
    url: "https://mobiz.service-now.com/nav_to.do?uri=sc_req_item.do?sys_id=ritm987654",
  };

  const mockCatalogTask: CatalogTask = {
    sysId: "ctask456789",
    number: "SCTASK0049921",
    shortDescription: "Configure VPN Access",
    requestItemNumber: "RITM0046210",
    requestNumber: "REQ0043549",
    state: "Work in Progress",
    active: true,
    assignedToName: "Alice Williams",
    url: "https://mobiz.service-now.com/nav_to.do?uri=sc_task.do?sys_id=ctask456789",
  };

  beforeEach(async () => {
    // Get the mocked client
    const { serviceNowClient } = await import("../../../lib/tools/servicenow");
    mockServiceNowClient = serviceNowClient;

    // Import the tool factory
    const { createServiceNowTool } = await import("../../../lib/agent/tools/service-now");

    // Create tool instance
    serviceNowTool = createServiceNowTool({
      updateStatus: vi.fn(),
      options: { channelId: "C123456" },
      caseNumbers: [],
    });

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("REQ Prefix Routing", () => {
    it("should route REQ prefix to getRequest method", async () => {
      vi.mocked(mockServiceNowClient.getRequest).mockResolvedValue(mockRequest);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "REQ0043549",
      });

      expect(mockServiceNowClient.getRequest).toHaveBeenCalledWith(
        "REQ0043549",
        expect.any(Object)
      );
      expect(mockServiceNowClient.getCase).not.toHaveBeenCalled();
      expect(mockServiceNowClient.getIncident).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        request: mockRequest,
        type: "sc_request",
      });
    });

    it("should handle REQ prefix case-insensitively", async () => {
      vi.mocked(mockServiceNowClient.getRequest).mockResolvedValue(mockRequest);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "req0043549",
      });

      expect(mockServiceNowClient.getRequest).toHaveBeenCalled();
      expect(result.request).toBeDefined();
    });

    it("should return error message when REQ not found", async () => {
      vi.mocked(mockServiceNowClient.getRequest).mockResolvedValue(null);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "REQ9999999",
      });

      expect(result).toMatchObject({
        case: null,
        message: expect.stringContaining("REQ9999999"),
        message: expect.stringContaining("not found"),
      });
    });
  });

  describe("RITM Prefix Routing", () => {
    it("should route RITM prefix to getRequestedItem method", async () => {
      vi.mocked(mockServiceNowClient.getRequestedItem).mockResolvedValue(mockRequestedItem);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "RITM0046210",
      });

      expect(mockServiceNowClient.getRequestedItem).toHaveBeenCalledWith(
        "RITM0046210",
        expect.any(Object)
      );
      expect(mockServiceNowClient.getCase).not.toHaveBeenCalled();
      expect(mockServiceNowClient.getIncident).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        requestedItem: mockRequestedItem,
        type: "sc_req_item",
      });
    });

    it("should handle RITM prefix case-insensitively", async () => {
      vi.mocked(mockServiceNowClient.getRequestedItem).mockResolvedValue(mockRequestedItem);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "ritm0046210",
      });

      expect(mockServiceNowClient.getRequestedItem).toHaveBeenCalled();
      expect(result.requestedItem).toBeDefined();
    });

    it("should return error message when RITM not found", async () => {
      vi.mocked(mockServiceNowClient.getRequestedItem).mockResolvedValue(null);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "RITM9999999",
      });

      expect(result).toMatchObject({
        case: null,
        message: expect.stringContaining("RITM9999999"),
        message: expect.stringContaining("not found"),
      });
    });
  });

  describe("SCTASK Prefix Routing", () => {
    it("should route SCTASK prefix to getCatalogTask method", async () => {
      vi.mocked(mockServiceNowClient.getCatalogTask).mockResolvedValue(mockCatalogTask);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "SCTASK0049921",
      });

      expect(mockServiceNowClient.getCatalogTask).toHaveBeenCalledWith(
        "SCTASK0049921",
        expect.any(Object)
      );
      expect(mockServiceNowClient.getCase).not.toHaveBeenCalled();
      expect(mockServiceNowClient.getIncident).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        catalogTask: mockCatalogTask,
        type: "sc_task",
      });
    });

    it("should handle SCTASK prefix case-insensitively", async () => {
      vi.mocked(mockServiceNowClient.getCatalogTask).mockResolvedValue(mockCatalogTask);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "sctask0049921",
      });

      expect(mockServiceNowClient.getCatalogTask).toHaveBeenCalled();
      expect(result.catalogTask).toBeDefined();
    });

    it("should return error message when SCTASK not found", async () => {
      vi.mocked(mockServiceNowClient.getCatalogTask).mockResolvedValue(null);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "SCTASK9999999",
      });

      expect(result).toMatchObject({
        case: null,
        message: expect.stringContaining("SCTASK9999999"),
        message: expect.stringContaining("not found"),
      });
    });

    it("should prioritize SCTASK over SC prefix", async () => {
      vi.mocked(mockServiceNowClient.getCatalogTask).mockResolvedValue(mockCatalogTask);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "SCTASK0049921",
      });

      // Should call getCatalogTask, NOT getCase (which handles SCS/CS prefixes)
      expect(mockServiceNowClient.getCatalogTask).toHaveBeenCalled();
      expect(mockServiceNowClient.getCase).not.toHaveBeenCalled();
    });
  });

  describe("Fallback Behavior", () => {
    it("should fall back to getCase for SCS prefix", async () => {
      const mockCase = {
        sys_id: "case123",
        number: "SCS1234567",
        short_description: "Test case",
      };
      vi.mocked(mockServiceNowClient.getCase).mockResolvedValue(mockCase);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "SCS1234567",
      });

      expect(mockServiceNowClient.getCase).toHaveBeenCalled();
      expect(mockServiceNowClient.getRequest).not.toHaveBeenCalled();
    });

    it("should fall back to getCase for INC prefix", async () => {
      const mockCase = {
        sys_id: "case123",
        number: "SCS0046363",
        short_description: "Test case",
      };
      vi.mocked(mockServiceNowClient.getCase).mockResolvedValue(mockCase);
      vi.mocked(mockServiceNowClient.getIncident).mockResolvedValue(null);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "INC0167587",
      });

      // Should try case first (getCase action default), then incident
      expect(mockServiceNowClient.getCase).toHaveBeenCalled();
    });

    it("should fall back to getCase for bare numbers", async () => {
      const mockCase = {
        sys_id: "case123",
        number: "SCS0046363",
        short_description: "Test case",
      };
      vi.mocked(mockServiceNowClient.getCase).mockResolvedValue(mockCase);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "46363",
      });

      expect(mockServiceNowClient.getCase).toHaveBeenCalled();
      expect(mockServiceNowClient.getRequest).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should return error object when number is missing", async () => {
      const result = await serviceNowTool.execute({
        action: "getCase",
        // number is missing
      });

      expect(result).toHaveProperty("error");
      expect(result.error).toContain("number is required");
    });

    it("should return error object when getRequest throws", async () => {
      vi.mocked(mockServiceNowClient.getRequest).mockRejectedValue(
        new Error("Network error")
      );

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "REQ0043549",
      });

      expect(result).toHaveProperty("error");
      expect(result.error).toContain("Network error");
    });
  });

  describe("Response Format", () => {
    it("should return request with type field for REQ", async () => {
      vi.mocked(mockServiceNowClient.getRequest).mockResolvedValue(mockRequest);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "REQ0043549",
      });

      expect(result).toHaveProperty("request");
      expect(result).toHaveProperty("type", "sc_request");
      expect(result).toHaveProperty("message");
    });

    it("should return requestedItem with type field for RITM", async () => {
      vi.mocked(mockServiceNowClient.getRequestedItem).mockResolvedValue(mockRequestedItem);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "RITM0046210",
      });

      expect(result).toHaveProperty("requestedItem");
      expect(result).toHaveProperty("type", "sc_req_item");
      expect(result).toHaveProperty("message");
    });

    it("should return catalogTask with type field for SCTASK", async () => {
      vi.mocked(mockServiceNowClient.getCatalogTask).mockResolvedValue(mockCatalogTask);

      const result = await serviceNowTool.execute({
        action: "getCase",
        number: "SCTASK0049921",
      });

      expect(result).toHaveProperty("catalogTask");
      expect(result).toHaveProperty("type", "sc_task");
      expect(result).toHaveProperty("message");
    });
  });
});
