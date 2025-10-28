/**
 * Unit Tests for Similar Cases Search Tool (Azure AI Search)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLegacyAgentTools } from "../../../lib/agent/tools/factory";
import type { ChatMessage } from "../../../lib/agent/types";

// Mock dependencies
vi.mock("../../../lib/services/azure-search", () => {
  const mockFn = vi.fn();
  return {
    createAzureSearchService: () => ({
      searchSimilarCases: mockFn,
    }),
    __mockSearchSimilarCases: mockFn,
  };
});

describe("Similar Cases Search Tool", () => {
  let tools: any;
  let mockSearchSimilarCases: any;
  const mockUpdateStatus = vi.fn();

  const createMockMessages = (): ChatMessage[] => [
    { role: "user", content: "Test message" },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get reference to the mock function
    const azureSearch = await import("../../../lib/services/azure-search");
    mockSearchSimilarCases = (azureSearch as any).__mockSearchSimilarCases;

    // Create tools
    tools = createLegacyAgentTools({
      messages: createMockMessages(),
      caseNumbers: ["SCS0001234"],
      updateStatus: mockUpdateStatus,
      options: { channelId: "C123456" },
    });
  });

  describe("Similar Cases Search - Success Cases", () => {
    it("should search for similar cases successfully", async () => {
      const mockResults = [
        {
          case_number: "SCS0001111",
          score: 0.92,
          content: "User experienced network connectivity issues. Resolution: restarted router.",
          created_at: "2024-01-15",
        },
        {
          case_number: "SCS0002222",
          score: 0.85,
          content: "Network outage affecting multiple users. Resolution: contacted ISP.",
          created_at: "2024-01-10",
        },
      ];

      mockSearchSimilarCases.mockResolvedValue(mockResults);

      const result = await tools.searchSimilarCases.execute({
        query: "network connectivity issues",
        topK: 5,
      });

      expect(mockSearchSimilarCases).toHaveBeenCalledWith(
        "network connectivity issues",
        {
          topK: 5,
          clientId: undefined,
        }
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        'is searching for similar cases to "network connectivity issues"...'
      );
      expect(result).toEqual({
        similar_cases: [
          {
            case_number: "SCS0001111",
            similarity_score: 0.92,
            content_preview: "User experienced network connectivity issues. Resolution: restarted router.",
            created_at: "2024-01-15",
          },
          {
            case_number: "SCS0002222",
            similarity_score: 0.85,
            content_preview: "Network outage affecting multiple users. Resolution: contacted ISP.",
            created_at: "2024-01-10",
          },
        ],
        total_found: 2,
      });
    });

    it("should use default topK when not provided", async () => {
      mockSearchSimilarCases.mockResolvedValue([]);

      await tools.searchSimilarCases.execute({
        query: "test query",
      });

      expect(mockSearchSimilarCases).toHaveBeenCalledWith(
        "test query",
        {
          topK: 5,
          clientId: undefined,
        }
      );
    });

    it("should filter by clientId when provided", async () => {
      mockSearchSimilarCases.mockResolvedValue([]);

      await tools.searchSimilarCases.execute({
        query: "test query",
        clientId: "CLIENT123",
        topK: 3,
      });

      expect(mockSearchSimilarCases).toHaveBeenCalledWith(
        "test query",
        {
          topK: 3,
          clientId: "CLIENT123",
        }
      );
    });

    it("should truncate long content to 300 characters", async () => {
      const longContent = "A".repeat(500);
      const mockResults = [
        {
          case_number: "SCS0003333",
          score: 0.88,
          content: longContent,
          created_at: "2024-01-20",
        },
      ];

      mockSearchSimilarCases.mockResolvedValue(mockResults);

      const result = await tools.searchSimilarCases.execute({
        query: "test",
      });

      expect(result.similar_cases[0].content_preview).toBe("A".repeat(300) + "...");
    });

    it("should not add ellipsis for content under 300 characters", async () => {
      const shortContent = "Short content here";
      const mockResults = [
        {
          case_number: "SCS0004444",
          score: 0.90,
          content: shortContent,
          created_at: "2024-01-25",
        },
      ];

      mockSearchSimilarCases.mockResolvedValue(mockResults);

      const result = await tools.searchSimilarCases.execute({
        query: "test",
      });

      expect(result.similar_cases[0].content_preview).toBe(shortContent);
    });
  });

  describe("Similar Cases Search - Empty Results", () => {
    it("should return message when no similar cases found", async () => {
      mockSearchSimilarCases.mockResolvedValue([]);

      const result = await tools.searchSimilarCases.execute({
        query: "very unique problem",
      });

      expect(result).toEqual({
        similar_cases: [],
        message: "No similar cases found.",
      });
    });
  });

  describe("Similar Cases Search - Error Handling", () => {
    it("should handle search errors gracefully", async () => {
      mockSearchSimilarCases.mockRejectedValue(
        new Error("Search service unavailable")
      );

      const result = await tools.searchSimilarCases.execute({
        query: "test query",
      });

      expect(result).toEqual({
        similar_cases: [],
        message: "No similar cases found.",
      });
    });

    // Note: Removed "service is null" test because the service is now always created at module load time
  });
});
