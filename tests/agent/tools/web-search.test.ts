/**
 * Unit Tests for Web Search Tool (Exa)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLegacyAgentTools } from "../../../lib/agent/tools/factory";
import type { CoreMessage } from "../../../lib/instrumented-ai";

// Mock dependencies
vi.mock("../../../lib/utils");

describe("Web Search Tool", () => {
  let mockExa: any;
  let tools: any;
  const mockUpdateStatus = vi.fn();

  const createMockMessages = (): CoreMessage[] => [
    { role: "user", content: "Search the web for something" },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup Exa mock
    const utils = await import("../../../lib/utils");
    mockExa = {
      searchAndContents: vi.fn(),
    };
    (utils as any).exa = mockExa;

    // Create tools
    tools = createLegacyAgentTools({
      messages: createMockMessages(),
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  describe("Web Search - Success Cases", () => {
    it("should search the web successfully", async () => {
      const mockResults = {
        results: [
          {
            title: "How to fix network issues",
            url: "https://example.com/article1",
            text: "A".repeat(1500),
          },
          {
            title: "Network troubleshooting guide",
            url: "https://example.com/article2",
            text: "Short article content here",
          },
        ],
      };

      mockExa.searchAndContents.mockResolvedValue(mockResults);

      const result = await tools.searchWeb.execute({
        query: "network troubleshooting",
        specificDomain: null,
      });

      expect(mockExa.searchAndContents).toHaveBeenCalledWith(
        "network troubleshooting",
        {
          livecrawl: "always",
          numResults: 3,
          includeDomains: undefined,
        }
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is searching the web for network troubleshooting..."
      );
      expect(result).toEqual({
        results: [
          {
            title: "How to fix network issues",
            url: "https://example.com/article1",
            snippet: "A".repeat(1000),
          },
          {
            title: "Network troubleshooting guide",
            url: "https://example.com/article2",
            snippet: "Short article content here",
          },
        ],
      });
    });

    it("should filter by specific domain when provided", async () => {
      const mockResults = {
        results: [
          {
            title: "BBC Article",
            url: "https://bbc.com/news/article",
            text: "BBC news content",
          },
        ],
      };

      mockExa.searchAndContents.mockResolvedValue(mockResults);

      await tools.searchWeb.execute({
        query: "latest news",
        specificDomain: "bbc.com",
      });

      expect(mockExa.searchAndContents).toHaveBeenCalledWith("latest news", {
        livecrawl: "always",
        numResults: 3,
        includeDomains: ["bbc.com"],
      });
    });

    it("should truncate long text to 1000 characters", async () => {
      const longText = "B".repeat(2000);
      const mockResults = {
        results: [
          {
            title: "Long article",
            url: "https://example.com/long",
            text: longText,
          },
        ],
      };

      mockExa.searchAndContents.mockResolvedValue(mockResults);

      const result = await tools.searchWeb.execute({
        query: "test",
        specificDomain: null,
      });

      expect(result.results[0].snippet).toBe("B".repeat(1000));
      expect(result.results[0].snippet.length).toBe(1000);
    });

    it("should preserve short text without truncation", async () => {
      const shortText = "Short content";
      const mockResults = {
        results: [
          {
            title: "Short article",
            url: "https://example.com/short",
            text: shortText,
          },
        ],
      };

      mockExa.searchAndContents.mockResolvedValue(mockResults);

      const result = await tools.searchWeb.execute({
        query: "test",
        specificDomain: null,
      });

      expect(result.results[0].snippet).toBe(shortText);
    });
  });

  describe("Web Search - Empty Results", () => {
    it("should handle empty search results", async () => {
      mockExa.searchAndContents.mockResolvedValue({ results: [] });

      const result = await tools.searchWeb.execute({
        query: "very specific query",
        specificDomain: null,
      });

      expect(result).toEqual({
        results: [],
      });
    });
  });

  describe("Web Search - Missing Client", () => {
    it("should return empty results when exa client not available", async () => {
      const utils = await import("../../../lib/utils");
      (utils as any).exa = null;

      const toolsWithoutExa = createLegacyAgentTools({
        messages: createMockMessages(),
        caseNumbers: [],
        updateStatus: mockUpdateStatus,
        options: {},
      });

      const result = await toolsWithoutExa.searchWeb.execute({
        query: "test query",
        specificDomain: null,
      });

      expect(result).toEqual({ results: [] });
    });

    it("should return empty results when exa client is undefined", async () => {
      const utils = await import("../../../lib/utils");
      (utils as any).exa = undefined;

      const toolsWithoutExa = createLegacyAgentTools({
        messages: createMockMessages(),
        caseNumbers: [],
        updateStatus: mockUpdateStatus,
        options: {},
      });

      const result = await toolsWithoutExa.searchWeb.execute({
        query: "test query",
        specificDomain: null,
      });

      expect(result).toEqual({ results: [] });
    });
  });
});
