/**
 * Unit Tests for Search Knowledge Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSearchKnowledgeTool } from "../../../../../lib/agent/tools/servicenow/knowledge/search-knowledge.tool";

// Mock dependencies
vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    searchKnowledge: vi.fn(),
  },
}));

import { serviceNowClient } from "../../../../../lib/tools/servicenow";

describe("Search Knowledge Tool", () => {
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockArticles = () => [
    {
      number: "KB0001",
      short_description: "How to reset password",
      url: "https://instance.service-now.com/kb_view.do?sysparm_article=KB0001",
      sys_id: "kb-sys-id-1",
    },
    {
      number: "KB0002",
      short_description: "VPN configuration guide",
      url: "https://instance.service-now.com/kb_view.do?sysparm_article=KB0002",
      sys_id: "kb-sys-id-2",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    tool = createSearchKnowledgeTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Knowledge Search", () => {
    it("should search knowledge base with query", async () => {
      const mockArticles = createMockArticles();
      (serviceNowClient.searchKnowledge as any).mockResolvedValue(mockArticles);

      const result = await tool.execute({ query: "password reset" });

      expect(serviceNowClient.searchKnowledge).toHaveBeenCalledWith(
        { query: "password reset", limit: 10 },
        expect.any(Object)
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining('is searching knowledge base for "password reset"')
      );
      expect(result.success).toBe(true);
      expect(result.data?.articles).toHaveLength(2);
      expect(result.data?.totalFound).toBe(2);
    });

    it("should use custom limit when provided", async () => {
      const mockArticles = createMockArticles();
      (serviceNowClient.searchKnowledge as any).mockResolvedValue(mockArticles);

      await tool.execute({ query: "VPN", limit: 5 });

      expect(serviceNowClient.searchKnowledge).toHaveBeenCalledWith(
        { query: "VPN", limit: 5 },
        expect.any(Object)
      );
    });

    it("should format article results correctly", async () => {
      const mockArticles = createMockArticles();
      (serviceNowClient.searchKnowledge as any).mockResolvedValue(mockArticles);

      const result = await tool.execute({ query: "password" });

      expect(result.success).toBe(true);
      expect(result.data?.articles[0]).toMatchObject({
        number: "KB0001",
        title: "How to reset password",
        url: expect.stringContaining("KB0001"),
        sysId: "kb-sys-id-1",
      });
    });
  });

  describe("Empty Results", () => {
    it("should handle no results gracefully", async () => {
      (serviceNowClient.searchKnowledge as any).mockResolvedValue([]);

      const result = await tool.execute({ query: "nonexistent topic" });

      expect(result.success).toBe(true);
      expect(result.data?.articles).toEqual([]);
      expect(result.data?.totalFound).toBe(0);
      expect(result.data?.message).toContain("No knowledge base articles found");
    });
  });

  describe("Limit Reached", () => {
    it("should indicate when limit is reached", async () => {
      const mockArticles = Array(10).fill(null).map((_, i) => ({
        number: `KB${String(i).padStart(4, "0")}`,
        short_description: `Article ${i}`,
        url: `https://instance.service-now.com/kb_view.do?sysparm_article=KB${i}`,
        sys_id: `kb-sys-id-${i}`,
      }));
      (serviceNowClient.searchKnowledge as any).mockResolvedValue(mockArticles);

      const result = await tool.execute({ query: "help", limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data?.totalFound).toBe(10);
      expect(result.data?.message).toContain("limit reached");
    });
  });

  describe("Error Handling", () => {
    it("should handle search errors gracefully", async () => {
      (serviceNowClient.searchKnowledge as any).mockRejectedValue(new Error("Search service unavailable"));

      const result = await tool.execute({ query: "password" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Search service unavailable");
    });

    it("should handle unknown errors", async () => {
      (serviceNowClient.searchKnowledge as any).mockRejectedValue("Unknown error");

      const result = await tool.execute({ query: "password" });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Failed to search knowledge base in ServiceNow");
    });
  });

  describe("Logging", () => {
    it("should log search activity", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockArticles = createMockArticles();
      (serviceNowClient.searchKnowledge as any).mockResolvedValue(mockArticles);

      await tool.execute({ query: "password reset" });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[search_knowledge] Searching knowledge base: query="password reset"')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[search_knowledge] Found 2 knowledge articles")
      );

      consoleLogSpy.mockRestore();
    });
  });
});
