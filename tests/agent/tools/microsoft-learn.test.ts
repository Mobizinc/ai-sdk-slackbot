/**
 * Unit Tests for Microsoft Learn Search Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentTools } from "../../../lib/agent/tools/factory";
import type { ChatMessage } from "../../../lib/agent/types";

// Mock dependencies
vi.mock("../../../lib/tools/microsoft-learn-mcp");

describe("Microsoft Learn Search Tool", () => {
  let mockMicrosoftLearnMCP: any;
  let tools: any;
  const mockUpdateStatus = vi.fn();

  const createMockMessages = (): ChatMessage[] => [
    { role: "user", content: "How to configure Azure?" },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup Microsoft Learn MCP mock
    const microsoftLearn = await import("../../../lib/tools/microsoft-learn-mcp");
    mockMicrosoftLearnMCP = microsoftLearn.microsoftLearnMCP as any;
    mockMicrosoftLearnMCP.search = vi.fn();

    // Create tools
    tools = createAgentTools({
      messages: createMockMessages(),
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  describe("Microsoft Learn Search - Success Cases", () => {
    it("should search Microsoft Learn successfully", async () => {
      const mockResults = [
        {
          title: "Configure Azure Virtual Network",
          url: "https://learn.microsoft.com/azure/vnet",
          content: "Learn how to configure Azure Virtual Networks...",
        },
        {
          title: "Azure Networking Best Practices",
          url: "https://learn.microsoft.com/azure/networking",
          content: "Best practices for Azure networking architecture...",
        },
      ];

      mockMicrosoftLearnMCP.search.mockResolvedValue(mockResults);

      const result = await tools.microsoftLearnSearch.execute({
        query: "Azure Virtual Network",
        limit: 3,
      });

      expect(mockMicrosoftLearnMCP.search).toHaveBeenCalledWith({
        query: "Azure Virtual Network",
        limit: 3,
      });
      expect(mockUpdateStatus).toHaveBeenCalledWith("is searching Microsoft Learn...");
      expect(result).toEqual({
        results: [
          {
            title: "Configure Azure Virtual Network",
            url: "https://learn.microsoft.com/azure/vnet",
            content: "Learn how to configure Azure Virtual Networks...",
          },
          {
            title: "Azure Networking Best Practices",
            url: "https://learn.microsoft.com/azure/networking",
            content: "Best practices for Azure networking architecture...",
          },
        ],
        total_found: 2,
      });
    });

    it("should use default limit when not provided", async () => {
      mockMicrosoftLearnMCP.search.mockResolvedValue([]);

      await tools.microsoftLearnSearch.execute({
        query: "PowerShell commands",
      });

      expect(mockMicrosoftLearnMCP.search).toHaveBeenCalledWith({
        query: "PowerShell commands",
        limit: 3,
      });
    });

    it("should respect custom limit parameter", async () => {
      mockMicrosoftLearnMCP.search.mockResolvedValue([]);

      await tools.microsoftLearnSearch.execute({
        query: "Exchange Online",
        limit: 5,
      });

      expect(mockMicrosoftLearnMCP.search).toHaveBeenCalledWith({
        query: "Exchange Online",
        limit: 5,
      });
    });

    it("should handle different query types", async () => {
      const mockResults = [
        {
          title: "Error 0x80070005 Access Denied",
          url: "https://learn.microsoft.com/troubleshoot",
          content: "This error typically occurs when...",
        },
      ];

      mockMicrosoftLearnMCP.search.mockResolvedValue(mockResults);

      const result = await tools.microsoftLearnSearch.execute({
        query: "error 0x80070005",
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toContain("0x80070005");
    });
  });

  describe("Microsoft Learn Search - Empty Results", () => {
    it("should return message when no results found", async () => {
      mockMicrosoftLearnMCP.search.mockResolvedValue([]);

      const result = await tools.microsoftLearnSearch.execute({
        query: "nonexistent topic xyz123",
      });

      expect(result).toEqual({
        results: [],
        message: 'No Microsoft Learn documentation found for "nonexistent topic xyz123".',
      });
    });
  });

  describe("Microsoft Learn Search - Error Handling", () => {
    it("should handle MCP search errors gracefully", async () => {
      mockMicrosoftLearnMCP.search.mockRejectedValue(
        new Error("MCP service unavailable")
      );

      const result = await tools.microsoftLearnSearch.execute({
        query: "Azure AD",
      });

      expect(result).toEqual({
        results: [],
        message: "Error searching Microsoft Learn documentation.",
      });
    });

    it("should handle network timeouts", async () => {
      mockMicrosoftLearnMCP.search.mockRejectedValue(
        new Error("ETIMEDOUT")
      );

      const result = await tools.microsoftLearnSearch.execute({
        query: "Windows Server",
      });

      expect(result).toEqual({
        results: [],
        message: "Error searching Microsoft Learn documentation.",
      });
    });

    it("should handle malformed responses", async () => {
      mockMicrosoftLearnMCP.search.mockRejectedValue(
        new Error("Invalid JSON response")
      );

      const result = await tools.microsoftLearnSearch.execute({
        query: "SharePoint",
      });

      expect(result).toEqual({
        results: [],
        message: "Error searching Microsoft Learn documentation.",
      });
    });
  });
});
