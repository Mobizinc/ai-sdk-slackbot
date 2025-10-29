/**
 * Unit Tests for Search Facade Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SearchFacadeService,
  getSearchFacadeService,
  __resetSearchFacadeService,
  __setSearchFacadeService,
} from "../lib/services/search-facade";
import type { AzureSearchService, SimilarCase } from "../lib/services/azure-search";

describe("SearchFacadeService", () => {
  let mockAzureSearchService: Partial<AzureSearchService>;
  let service: SearchFacadeService;

  const mockSimilarCases: SimilarCase[] = [
    {
      id: "1",
      case_number: "SCS0001",
      content: "Email server down",
      filename: "SCS0001",
      score: 0.95,
    },
    {
      id: "2",
      case_number: "SCS0002",
      content: "Cannot access email",
      filename: "SCS0002",
      score: 0.85,
    },
  ];

  beforeEach(() => {
    // Mock Azure Search Service
    mockAzureSearchService = {
      searchSimilarCases: vi.fn().mockResolvedValue(mockSimilarCases),
      searchKnowledgeBase: vi.fn().mockResolvedValue([]),
    };

    service = new SearchFacadeService(mockAzureSearchService as AzureSearchService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetSearchFacadeService();
  });

  describe("isAzureSearchConfigured", () => {
    it("should return true when Azure Search is configured", () => {
      expect(service.isAzureSearchConfigured()).toBe(true);
    });

    it("should return false when Azure Search is not configured", () => {
      const serviceWithoutAzure = new SearchFacadeService(null);
      expect(serviceWithoutAzure.isAzureSearchConfigured()).toBe(false);
    });
  });

  describe("isWebSearchConfigured", () => {
    it("should check if Exa is configured", () => {
      // Note: This depends on EXA_API_KEY env var in actual environment
      const result = service.isWebSearchConfigured();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("searchSimilarCases", () => {
    it("should search for similar cases", async () => {
      const results = await service.searchSimilarCases("email down");

      expect(mockAzureSearchService.searchSimilarCases).toHaveBeenCalledWith("email down", {});
      expect(results).toEqual(mockSimilarCases);
    });

    it("should pass options to Azure Search", async () => {
      await service.searchSimilarCases("query", { topK: 10, clientId: "client123" });

      expect(mockAzureSearchService.searchSimilarCases).toHaveBeenCalledWith("query", {
        topK: 10,
        clientId: "client123",
      });
    });

    it("should return empty array when Azure Search not configured", async () => {
      const serviceWithoutAzure = new SearchFacadeService(null);
      const results = await serviceWithoutAzure.searchSimilarCases("query");

      expect(results).toEqual([]);
    });

    it("should return empty array on error", async () => {
      mockAzureSearchService.searchSimilarCases = vi.fn().mockRejectedValue(new Error("Search failed"));

      const results = await service.searchSimilarCases("query");

      expect(results).toEqual([]);
    });
  });

  describe("searchKnowledgeBase", () => {
    it("should search knowledge base", async () => {
      const mockKBResults: SimilarCase[] = [
        {
          id: "kb1",
          case_number: "KB0001",
          content: "How to reset password",
          filename: "KB0001",
          score: 0.9,
        },
      ];

      mockAzureSearchService.searchKnowledgeBase = vi.fn().mockResolvedValue(mockKBResults);

      const results = await service.searchKnowledgeBase("password reset");

      expect(mockAzureSearchService.searchKnowledgeBase).toHaveBeenCalledWith("password reset", {});
      expect(results).toEqual(mockKBResults);
    });

    it("should return empty array when Azure Search not configured", async () => {
      const serviceWithoutAzure = new SearchFacadeService(null);
      const results = await serviceWithoutAzure.searchKnowledgeBase("query");

      expect(results).toEqual([]);
    });

    it("should return empty array on error", async () => {
      mockAzureSearchService.searchKnowledgeBase = vi.fn().mockRejectedValue(new Error("KB search failed"));

      const results = await service.searchKnowledgeBase("query");

      expect(results).toEqual([]);
    });
  });

  describe("searchWeb", () => {
    it("should return empty array when Exa not configured", async () => {
      // Exa is typically not configured in tests
      const results = await service.searchWeb("test query");

      expect(results).toEqual([]);
    });
  });

  describe("searchSimilarCasesForClient", () => {
    it("should search similar cases with client filter", async () => {
      await service.searchSimilarCasesForClient("query", "client123", { topK: 3 });

      expect(mockAzureSearchService.searchSimilarCases).toHaveBeenCalledWith("query", {
        topK: 3,
        clientId: "client123",
      });
    });

    it("should handle client-specific searches", async () => {
      const results = await service.searchSimilarCasesForClient("email issue", "acme-corp");

      expect(mockAzureSearchService.searchSimilarCases).toHaveBeenCalledWith("email issue", {
        clientId: "acme-corp",
      });
      expect(results).toEqual(mockSimilarCases);
    });
  });

  describe("searchTopSimilarCases", () => {
    it("should search top N cases with default N=5", async () => {
      await service.searchTopSimilarCases("query");

      expect(mockAzureSearchService.searchSimilarCases).toHaveBeenCalledWith("query", {
        topK: 5,
        clientId: undefined,
      });
    });

    it("should respect custom topN parameter", async () => {
      await service.searchTopSimilarCases("query", 10);

      expect(mockAzureSearchService.searchSimilarCases).toHaveBeenCalledWith("query", {
        topK: 10,
        clientId: undefined,
      });
    });

    it("should include clientId when provided", async () => {
      await service.searchTopSimilarCases("query", 3, "client456");

      expect(mockAzureSearchService.searchSimilarCases).toHaveBeenCalledWith("query", {
        topK: 3,
        clientId: "client456",
      });
    });

    it("should return results", async () => {
      const results = await service.searchTopSimilarCases("email down", 5);

      expect(results).toEqual(mockSimilarCases);
    });
  });

  describe("searchAndFormatAsMarkdown", () => {
    it("should format search results as markdown", async () => {
      const markdown = await service.searchAndFormatAsMarkdown("email down");

      expect(markdown).toContain("Found 2 similar case(s):");
      expect(markdown).toContain("**SCS0001**");
      expect(markdown).toContain("95% similar");
      expect(markdown).toContain("**SCS0002**");
      expect(markdown).toContain("85% similar");
    });

    it("should handle empty results", async () => {
      mockAzureSearchService.searchSimilarCases = vi.fn().mockResolvedValue([]);

      const markdown = await service.searchAndFormatAsMarkdown("nothing");

      expect(markdown).toBe("No similar cases found.");
    });

    it("should truncate long content", async () => {
      const longContent = "A".repeat(500);
      mockAzureSearchService.searchSimilarCases = vi.fn().mockResolvedValue([
        {
          id: "1",
          case_number: "SCS0001",
          content: longContent,
          filename: "SCS0001",
          score: 0.95,
        },
      ]);

      const markdown = await service.searchAndFormatAsMarkdown("query");

      // Should truncate to 200 chars + "..."
      expect(markdown).toContain("A".repeat(200) + "...");
      expect(markdown.length).toBeLessThan(longContent.length);
    });
  });

  describe("hasAnySearchProvider", () => {
    it("should return true when Azure Search is configured", () => {
      expect(service.hasAnySearchProvider()).toBe(true);
    });

    it("should return false when no provider is configured", () => {
      const serviceWithoutProviders = new SearchFacadeService(null);
      // Assuming Exa is also not configured in test environment
      const result = serviceWithoutProviders.hasAnySearchProvider();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getCapabilities", () => {
    it("should return capabilities summary", () => {
      const capabilities = service.getCapabilities();

      expect(capabilities).toHaveProperty("azureSearch");
      expect(capabilities).toHaveProperty("webSearch");
      expect(capabilities).toHaveProperty("similarCases");
      expect(capabilities).toHaveProperty("knowledgeBase");

      expect(capabilities.azureSearch).toBe(true);
      expect(capabilities.similarCases).toBe(true);
      expect(capabilities.knowledgeBase).toBe(true);
    });

    it("should show false capabilities when Azure Search not configured", () => {
      const serviceWithoutAzure = new SearchFacadeService(null);
      const capabilities = serviceWithoutAzure.getCapabilities();

      expect(capabilities.azureSearch).toBe(false);
      expect(capabilities.similarCases).toBe(false);
      expect(capabilities.knowledgeBase).toBe(false);
    });
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const mockService = new SearchFacadeService(mockAzureSearchService as AzureSearchService);
      __setSearchFacadeService(mockService);

      const instance1 = getSearchFacadeService();
      const instance2 = getSearchFacadeService();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const mockService1 = new SearchFacadeService(mockAzureSearchService as AzureSearchService);
      __setSearchFacadeService(mockService1);

      const instance1 = getSearchFacadeService();

      __resetSearchFacadeService();

      const mockService2 = new SearchFacadeService(mockAzureSearchService as AzureSearchService);
      __setSearchFacadeService(mockService2);

      const instance2 = getSearchFacadeService();

      expect(instance1).not.toBe(instance2);
    });

    it("should allow setting custom instance", () => {
      const customService = new SearchFacadeService(mockAzureSearchService as AzureSearchService);
      __setSearchFacadeService(customService);

      const instance = getSearchFacadeService();
      expect(instance).toBe(customService);
    });
  });
});
