/**
 * Unit Tests for ServiceNow Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLegacyAgentTools } from "../../../lib/agent/tools/factory";
import type { CoreMessage } from "../../../lib/instrumented-ai";

// Mock dependencies
vi.mock("../../../lib/tools/servicenow");
vi.mock("../../../lib/context-manager");

describe("ServiceNow Tool", () => {
  let mockServiceNowClient: any;
  let tools: any;
  const mockUpdateStatus = vi.fn();

  const createMockMessages = (): CoreMessage[] => [
    { role: "user", content: "Test message" },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup ServiceNow client mock
    const serviceNow = await import("../../../lib/tools/servicenow");
    mockServiceNowClient = serviceNow.serviceNowClient as any;

    mockServiceNowClient.isConfigured = vi.fn().mockReturnValue(true);
    mockServiceNowClient.getCase = vi.fn();
    mockServiceNowClient.getIncident = vi.fn();
    mockServiceNowClient.getCaseJournal = vi.fn();
    mockServiceNowClient.searchKnowledge = vi.fn();
    mockServiceNowClient.searchConfigurationItems = vi.fn();
    mockServiceNowClient.searchCases = vi.fn();

    // Create tools
    tools = createLegacyAgentTools({
      messages: createMockMessages(),
      caseNumbers: ["SCS0001234"],
      updateStatus: mockUpdateStatus,
      options: { channelId: "C123456" },
    });
  });

  describe("ServiceNow Tool - Configuration", () => {
    it("should return error when ServiceNow is not configured", async () => {
      mockServiceNowClient.isConfigured.mockReturnValue(false);

      const result = await tools.serviceNow.execute({
        action: "getCase",
        number: "SCS0001234",
      });

      expect(result).toEqual({
        error: expect.stringContaining("ServiceNow integration is not configured"),
      });
    });
  });

  describe("ServiceNow Tool - getCase Action", () => {
    it("should retrieve a case successfully", async () => {
      const mockCase = {
        number: "SCS0001234",
        sys_id: "abc123",
        short_description: "Test case",
        state: "Open",
      };
      mockServiceNowClient.getCase.mockResolvedValue(mockCase);

      const result = await tools.serviceNow.execute({
        action: "getCase",
        number: "SCS0001234",
      });

      expect(mockServiceNowClient.getCase).toHaveBeenCalledWith("SCS0001234");
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is looking up case SCS0001234 in ServiceNow..."
      );
      expect(result).toEqual({ case: mockCase });
    });

    it("should fallback to incident table if case not found", async () => {
      const mockIncident = {
        number: "INC0001234",
        sys_id: "xyz789",
        short_description: "Test incident",
      };
      mockServiceNowClient.getCase.mockResolvedValue(null);
      mockServiceNowClient.getIncident.mockResolvedValue(mockIncident);

      const result = await tools.serviceNow.execute({
        action: "getCase",
        number: "INC0001234",
      });

      expect(mockServiceNowClient.getCase).toHaveBeenCalledWith("INC0001234");
      expect(mockServiceNowClient.getIncident).toHaveBeenCalledWith("INC0001234");
      expect(result).toEqual({ incident: mockIncident });
    });

    it("should return not found message when case and incident both missing", async () => {
      mockServiceNowClient.getCase.mockResolvedValue(null);
      mockServiceNowClient.getIncident.mockResolvedValue(null);

      const result = await tools.serviceNow.execute({
        action: "getCase",
        number: "SCS0009999",
      });

      expect(result).toEqual({
        case: null,
        message: expect.stringContaining("not found in ServiceNow"),
      });
    });

    it("should throw error when number is missing", async () => {
      const result = await tools.serviceNow.execute({
        action: "getCase",
      });

      expect(result).toEqual({
        error: "number is required to retrieve a ServiceNow case.",
      });
    });
  });

  describe("ServiceNow Tool - getIncident Action", () => {
    it("should retrieve an incident successfully", async () => {
      const mockIncident = {
        number: "INC0001234",
        sys_id: "xyz789",
        short_description: "Test incident",
      };
      mockServiceNowClient.getIncident.mockResolvedValue(mockIncident);

      const result = await tools.serviceNow.execute({
        action: "getIncident",
        number: "INC0001234",
      });

      expect(mockServiceNowClient.getIncident).toHaveBeenCalledWith("INC0001234");
      expect(result).toEqual({ incident: mockIncident });
    });

    it("should fallback to case table if incident not found", async () => {
      const mockCase = {
        number: "SCS0001234",
        sys_id: "abc123",
        short_description: "Test case",
      };
      mockServiceNowClient.getIncident.mockResolvedValue(null);
      mockServiceNowClient.getCase.mockResolvedValue(mockCase);

      const result = await tools.serviceNow.execute({
        action: "getIncident",
        number: "SCS0001234",
      });

      expect(mockServiceNowClient.getIncident).toHaveBeenCalledWith("SCS0001234");
      expect(mockServiceNowClient.getCase).toHaveBeenCalledWith("SCS0001234");
      expect(result).toEqual({ case: mockCase });
    });
  });

  describe("ServiceNow Tool - getCaseJournal Action", () => {
    it("should fetch journal entries with caseSysId", async () => {
      const mockJournal = [
        { created_at: "2024-01-01", value: "Comment 1" },
        { created_at: "2024-01-02", value: "Comment 2" },
      ];
      mockServiceNowClient.getCaseJournal.mockResolvedValue(mockJournal);

      const result = await tools.serviceNow.execute({
        action: "getCaseJournal",
        caseSysId: "abc123",
        limit: 10,
      });

      expect(mockServiceNowClient.getCaseJournal).toHaveBeenCalledWith("abc123", {
        limit: 10,
      });
      expect(result).toEqual({
        entries: mockJournal,
        total: 2,
      });
    });

    it("should fetch journal entries by looking up case number", async () => {
      const mockCase = { sys_id: "abc123", number: "SCS0001234" };
      const mockJournal = [{ created_at: "2024-01-01", value: "Comment" }];
      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockServiceNowClient.getCaseJournal.mockResolvedValue(mockJournal);

      const result = await tools.serviceNow.execute({
        action: "getCaseJournal",
        number: "SCS0001234",
      });

      expect(mockServiceNowClient.getCase).toHaveBeenCalledWith("SCS0001234");
      expect(mockServiceNowClient.getCaseJournal).toHaveBeenCalledWith("abc123", {
        limit: 20,
      });
      expect(result).toEqual({
        entries: mockJournal,
        total: 1,
      });
    });

    it("should return empty entries when case not found", async () => {
      mockServiceNowClient.getCase.mockResolvedValue(null);

      const result = await tools.serviceNow.execute({
        action: "getCaseJournal",
        number: "SCS0009999",
      });

      expect(result).toEqual({
        entries: [],
        message: expect.stringContaining("not found in ServiceNow"),
      });
    });

    it("should throw error when both caseSysId and number are missing", async () => {
      const result = await tools.serviceNow.execute({
        action: "getCaseJournal",
      });

      expect(result).toEqual({
        error: "Provide either caseSysId or number to retrieve journal entries.",
      });
    });
  });

  describe("ServiceNow Tool - searchKnowledge Action", () => {
    it("should search knowledge base successfully", async () => {
      const mockArticles = [
        { number: "KB0001", title: "How to reset password" },
        { number: "KB0002", title: "Network troubleshooting" },
      ];
      mockServiceNowClient.searchKnowledge.mockResolvedValue(mockArticles);

      const result = await tools.serviceNow.execute({
        action: "searchKnowledge",
        query: "password reset",
        limit: 5,
      });

      expect(mockServiceNowClient.searchKnowledge).toHaveBeenCalledWith(
        "password reset",
        { limit: 5 }
      );
      expect(result).toEqual({
        articles: mockArticles,
        total_found: 2,
      });
    });

    it("should use default limit when not provided", async () => {
      mockServiceNowClient.searchKnowledge.mockResolvedValue([]);

      await tools.serviceNow.execute({
        action: "searchKnowledge",
        query: "test",
      });

      expect(mockServiceNowClient.searchKnowledge).toHaveBeenCalledWith("test", {
        limit: 10,
      });
    });

    it("should throw error when query is missing", async () => {
      const result = await tools.serviceNow.execute({
        action: "searchKnowledge",
      });

      expect(result).toEqual({
        error: "query is required to search knowledge base articles.",
      });
    });
  });

  describe("ServiceNow Tool - searchConfigurationItem Action", () => {
    it("should search configuration items by CI name", async () => {
      const mockCIs = [
        { name: "server01", sys_id: "ci123", ip_address: "10.0.0.1" },
      ];
      mockServiceNowClient.searchConfigurationItems.mockResolvedValue(mockCIs);

      const result = await tools.serviceNow.execute({
        action: "searchConfigurationItem",
        ciName: "server01",
      });

      expect(mockServiceNowClient.searchConfigurationItems).toHaveBeenCalledWith({
        ciName: "server01",
        ipAddress: undefined,
        ciSysId: undefined,
        limit: 10,
      });
      expect(result).toEqual({
        configuration_items: mockCIs,
        total_found: 1,
      });
    });

    it("should search configuration items by IP address", async () => {
      const mockCIs = [
        { name: "server02", sys_id: "ci456", ip_address: "10.0.0.2" },
      ];
      mockServiceNowClient.searchConfigurationItems.mockResolvedValue(mockCIs);

      const result = await tools.serviceNow.execute({
        action: "searchConfigurationItem",
        ipAddress: "10.0.0.2",
        limit: 5,
      });

      expect(mockServiceNowClient.searchConfigurationItems).toHaveBeenCalledWith({
        ciName: undefined,
        ipAddress: "10.0.0.2",
        ciSysId: undefined,
        limit: 5,
      });
      expect(result).toEqual({
        configuration_items: mockCIs,
        total_found: 1,
      });
    });

    it("should throw error when all search params are missing", async () => {
      const result = await tools.serviceNow.execute({
        action: "searchConfigurationItem",
      });

      expect(result).toEqual({
        error: "Provide ciName, ipAddress, or ciSysId to search for a configuration item.",
      });
    });
  });

  describe("ServiceNow Tool - searchCases Action", () => {
    it("should search cases with filters", async () => {
      const mockCases = [
        { number: "SCS0001", short_description: "Test case 1", priority: "2" },
        { number: "SCS0002", short_description: "Test case 2", priority: "3" },
      ];
      mockServiceNowClient.searchCases.mockResolvedValue(mockCases);

      const result = await tools.serviceNow.execute({
        action: "searchCases",
        companyName: "Acme Corp",
        priority: "2",
        state: "Open",
        limit: 10,
      });

      expect(mockServiceNowClient.searchCases).toHaveBeenCalledWith({
        query: undefined,
        limit: 10,
        ciName: undefined,
        ipAddress: undefined,
        accountName: undefined,
        companyName: "Acme Corp",
        priority: "2",
        state: "Open",
        assignmentGroup: undefined,
        assignedTo: undefined,
        openedAfter: undefined,
        openedBefore: undefined,
        activeOnly: undefined,
        sortBy: undefined,
        sortOrder: undefined,
      });
      expect(result).toEqual({
        cases: mockCases,
        total_found: 2,
        applied_filters: expect.objectContaining({
          companyName: "Acme Corp",
          priority: "2",
          state: "Open",
        }),
      });
    });

    it("should update status with company name when provided", async () => {
      mockServiceNowClient.searchCases.mockResolvedValue([]);

      await tools.serviceNow.execute({
        action: "searchCases",
        companyName: "Test Company",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is searching ServiceNow cases for Test Company..."
      );
    });

    it("should update status without company name when not provided", async () => {
      mockServiceNowClient.searchCases.mockResolvedValue([]);

      await tools.serviceNow.execute({
        action: "searchCases",
        priority: "1",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is searching ServiceNow cases..."
      );
    });
  });

  describe("ServiceNow Tool - Error Handling", () => {
    it("should return error for unsupported action", async () => {
      const result = await tools.serviceNow.execute({
        action: "invalidAction" as any,
      });

      expect(result).toEqual({
        error: "Unsupported action: invalidAction",
      });
    });

    it("should handle ServiceNow API errors gracefully", async () => {
      mockServiceNowClient.getCase.mockRejectedValue(
        new Error("API connection failed")
      );

      const result = await tools.serviceNow.execute({
        action: "getCase",
        number: "SCS0001234",
      });

      expect(result).toEqual({
        error: "API connection failed",
      });
    });

    it("should handle non-Error exceptions", async () => {
      mockServiceNowClient.getCase.mockRejectedValue("String error");

      const result = await tools.serviceNow.execute({
        action: "getCase",
        number: "SCS0001234",
      });

      expect(result).toEqual({
        error: "ServiceNow operation failed",
      });
    });
  });
});
