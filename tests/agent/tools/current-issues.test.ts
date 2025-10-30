/**
 * Unit Tests for Current Issues Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentTools } from "../../../lib/agent/tools/factory";
import type { ChatMessage } from "../../../lib/agent/types";

// Mock dependencies
vi.mock("../../../lib/services/current-issues-service");

describe("Current Issues Tool", () => {
  let mockCurrentIssuesService: any;
  let tools: any;

  const createMockMessages = (): ChatMessage[] => [
    { role: "user", content: "What issues are affecting us?" },
  ];

  const createMockCurrentIssuesResult = (overrides = {}) => ({
    channelName: "acme-support",
    openCases: [
      {
        number: "SCS0001234",
        short_description: "Email delivery failure",
        priority: "2",
        state: "Open",
        opened_at: "2024-01-15T10:00:00Z",
      },
    ],
    recentThreads: [
      {
        threadTs: "1234567890.123456",
        firstMessage: "Experiencing login issues",
        timestamp: "2024-01-15T11:00:00Z",
      },
    ],
    summary: "2 active issues detected",
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup current issues service mock
    const currentIssues = await import("../../../lib/services/current-issues-service");
    mockCurrentIssuesService = {
      getCurrentIssues: vi.fn(),
    };
    (currentIssues.getCurrentIssuesService as any).mockReturnValue(mockCurrentIssuesService);

    // Create tools
    tools = createAgentTools({
      messages: createMockMessages(),
      caseNumbers: [],
      options: { channelId: "C123456" },
    });
  });

  describe("Current Issues - Success Cases", () => {
    it("should fetch current issues using channelId from options", async () => {
      const mockResult = createMockCurrentIssuesResult();
      mockCurrentIssuesService.getCurrentIssues.mockResolvedValue(mockResult);

      const result = await tools.fetchCurrentIssues.execute({});

      expect(mockCurrentIssuesService.getCurrentIssues).toHaveBeenCalledWith("C123456");
      expect(result).toEqual({
        result: mockResult,
      });
    });

    it("should fetch current issues using provided channelId", async () => {
      const mockResult = createMockCurrentIssuesResult();
      mockCurrentIssuesService.getCurrentIssues.mockResolvedValue(mockResult);

      const result = await tools.fetchCurrentIssues.execute({
        channelId: "C999999",
      });

      expect(mockCurrentIssuesService.getCurrentIssues).toHaveBeenCalledWith("C999999");
      expect(result).toEqual({
        result: mockResult,
      });
    });

    it("should override missing channelName with hint when provided", async () => {
      const mockResult = createMockCurrentIssuesResult({
        channelName: undefined,
      });
      mockCurrentIssuesService.getCurrentIssues.mockResolvedValue(mockResult);

      const result = await tools.fetchCurrentIssues.execute({
        channelNameHint: "custom-channel",
      });

      expect(result.result.channelName).toBe("custom-channel");
    });

    it("should not override existing channelName with hint", async () => {
      const mockResult = createMockCurrentIssuesResult({
        channelName: "original-channel",
      });
      mockCurrentIssuesService.getCurrentIssues.mockResolvedValue(mockResult);

      const result = await tools.fetchCurrentIssues.execute({
        channelNameHint: "hint-channel",
      });

      expect(result.result.channelName).toBe("original-channel");
    });

    it("should handle empty results", async () => {
      const mockResult = createMockCurrentIssuesResult({
        openCases: [],
        recentThreads: [],
        summary: "No active issues",
      });
      mockCurrentIssuesService.getCurrentIssues.mockResolvedValue(mockResult);

      const result = await tools.fetchCurrentIssues.execute({});

      expect(result.result.openCases).toEqual([]);
      expect(result.result.recentThreads).toEqual([]);
      expect(result.result.summary).toBe("No active issues");
    });
  });

  describe("Current Issues - Error Cases", () => {
    it("should return error when channelId is not available", async () => {
      const toolsWithoutChannel = createAgentTools({
        messages: createMockMessages(),
        caseNumbers: [],
        options: {},
      });

      const result = await toolsWithoutChannel.fetchCurrentIssues.execute({});

      expect(result).toEqual({
        error: expect.stringContaining("channelId is required"),
      });
    });

    it("should handle service errors gracefully", async () => {
      mockCurrentIssuesService.getCurrentIssues.mockRejectedValue(
        new Error("Service unavailable")
      );

      await expect(
        tools.fetchCurrentIssues.execute({})
      ).rejects.toThrow("Service unavailable");
    });

    it("should prefer explicit channelId over options channelId", async () => {
      const mockResult = createMockCurrentIssuesResult();
      mockCurrentIssuesService.getCurrentIssues.mockResolvedValue(mockResult);

      await tools.fetchCurrentIssues.execute({
        channelId: "C777777",
      });

      expect(mockCurrentIssuesService.getCurrentIssues).toHaveBeenCalledWith("C777777");
      expect(mockCurrentIssuesService.getCurrentIssues).not.toHaveBeenCalledWith("C123456");
    });
  });
});
