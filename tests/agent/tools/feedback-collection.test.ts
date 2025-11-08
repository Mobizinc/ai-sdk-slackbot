/**
 * Feedback Collection Tool Tests
 *
 * Tests the integrated feedback collection tool that combines
 * BRD generation and GitHub issue creation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { CoreMessage } from "../../../lib/agent/tools/shared";

// Mock the services
vi.mock("../../../lib/services/brd-generator", () => ({
  generateBRD: vi.fn(),
}));

vi.mock("../../../lib/services/github-issue-service", () => ({
  createGitHubIssue: vi.fn(),
}));

// Import tool and mocked services after mocking
import { createFeedbackCollectionTool, type FeedbackCollectionInput } from "../../../lib/agent/tools/feedback-collection";
import { generateBRD } from "../../../lib/services/brd-generator";
import { createGitHubIssue } from "../../../lib/services/github-issue-service";

describe("Feedback Collection Tool", () => {
  const mockGenerateBRD = generateBRD as Mock;
  const mockCreateGitHubIssue = createGitHubIssue as Mock;
  const mockUpdateStatus = vi.fn();

  const mockMessages: CoreMessage[] = [
    {
      role: "user",
      content: "I need a better search feature",
    },
    {
      role: "assistant",
      content: "I understand you need improved search capabilities. Let me help you with that.",
    },
    {
      role: "user",
      content: "Yes, I want to search with multiple filters and date ranges",
    },
  ];

  const mockBRD = {
    title: "Feature Request: Advanced Search",
    problemStatement: "Users need better search capabilities",
    userStory: "As a user, I want to search effectively",
    acceptanceCriteria: ["Support multiple filters", "Include date ranges"],
    technicalContext: "Requires API enhancements",
    conversationTranscript: undefined,
  };

  const mockIssue = {
    number: 123,
    htmlUrl: "https://github.com/owner/repo/issues/123",
    title: "Feature Request: Advanced Search",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default successful responses
    mockGenerateBRD.mockResolvedValue(mockBRD);
    mockCreateGitHubIssue.mockResolvedValue(mockIssue);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Flow", () => {
    it("should complete end-to-end successful flow", async () => {
      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: mockMessages,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Advanced search with filters",
        useCase: "Finding specific cases quickly",
        currentLimitation: "Basic text search only",
      };

      const result = await tool.execute(input);

      expect(result).toEqual({
        success: true,
        message: "Feature request submitted successfully! Created GitHub issue #123: Feature Request: Advanced Search",
        issueUrl: "https://github.com/owner/repo/issues/123",
        issueNumber: 123,
      });

      // Verify service calls
      expect(mockGenerateBRD).toHaveBeenCalledWith({
        featureDescription: "Advanced search with filters",
        useCase: "Finding specific cases quickly",
        currentLimitation: "Basic text search only",
        conversationContext: expect.stringContaining("[1] User: I need a better search feature"),
      });

      expect(mockCreateGitHubIssue).toHaveBeenCalledWith({
        brd: mockBRD,
        slackThreadUrl: undefined,
        requestedBy: "Slack User",
      });

      // Verify status updates
      expect(mockUpdateStatus).toHaveBeenCalledWith("is generating requirements document...");
      expect(mockUpdateStatus).toHaveBeenCalledWith("is creating GitHub issue...");
    });

    it("should build conversation context from various message types", async () => {
      const complexMessages: CoreMessage[] = [
        {
          role: "user",
          content: "Text message",
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Multi-part response" },
            { type: "tool-use", toolUseId: "123", toolName: "test", input: {} },
          ],
        },
        {
          role: "user",
          content: [
            { type: "text", text: "User with text" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } },
          ],
        },
      ];

      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: complexMessages,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test feature",
        useCase: "Test use case",
        currentLimitation: "Test limitation",
      };

      await tool.execute(input);

      const callArgs = mockGenerateBRD.mock.calls[0][0];
      expect(callArgs.conversationContext).toContain("[1] User: Text message");
      expect(callArgs.conversationContext).toContain("[2] Assistant: Multi-part response");
      expect(callArgs.conversationContext).toContain("[3] User: User with text");
      expect(callArgs.conversationContext).not.toContain("tool-use");
      expect(callArgs.conversationContext).not.toContain("image");
    });

    it("should handle empty conversation context", async () => {
      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: [],
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test feature",
        useCase: "Test use case",
        currentLimitation: "Test limitation",
      };

      await tool.execute(input);

      const callArgs = mockGenerateBRD.mock.calls[0][0];
      expect(callArgs.conversationContext).toBe("");
    });
  });

  describe("Error Handling", () => {
    it("should handle BRD generation failure", async () => {
      mockGenerateBRD.mockRejectedValueOnce(new Error("Claude API error"));

      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: mockMessages,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test feature",
        useCase: "Test use case",
        currentLimitation: "Test limitation",
      };

      const result = await tool.execute(input);

      expect(result).toEqual({
        success: false,
        message: "Failed to submit feature request: Claude API error",
        error: "Claude API error",
      });

      expect(mockCreateGitHubIssue).not.toHaveBeenCalled();
    });

    it("should handle GitHub issue creation failure", async () => {
      mockCreateGitHubIssue.mockRejectedValueOnce(new Error("GitHub API rate limit"));

      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: mockMessages,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test feature",
        useCase: "Test use case",
        currentLimitation: "Test limitation",
      };

      const result = await tool.execute(input);

      expect(result).toEqual({
        success: false,
        message: "Failed to submit feature request: GitHub API rate limit",
        error: "GitHub API rate limit",
      });

      expect(mockGenerateBRD).toHaveBeenCalled();
    });

    it("should format error messages properly", async () => {
      const errors = [
        { error: new Error("Simple error"), expected: "Simple error" },
        { error: "String error", expected: "Unknown error" },  // Non-Error objects become "Unknown error"
        { error: { message: "Object with message" }, expected: "Unknown error" },
        { error: null, expected: "Unknown error" },
        { error: undefined, expected: "Unknown error" },
      ];

      for (const { error, expected } of errors) {
        mockGenerateBRD.mockRejectedValueOnce(error);

        const tool = createFeedbackCollectionTool({
          updateStatus: mockUpdateStatus,
          messages: mockMessages,
        });

        const input: FeedbackCollectionInput = {
          featureDescription: "Test feature",
          useCase: "Test use case",
          currentLimitation: "Test limitation",
        };

        const result = await tool.execute(input);

        expect(result.error).toContain(expected);
      }
    });
  });

  describe("Status Updates", () => {
    it("should call updateStatus callbacks at correct times", async () => {
      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: mockMessages,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test feature",
        useCase: "Test use case",
        currentLimitation: "Test limitation",
      };

      await tool.execute(input);

      // Verify status updates in order
      expect(mockUpdateStatus.mock.calls).toEqual([
        ["is generating requirements document..."],
        ["is creating GitHub issue..."],
      ]);
    });

    it("should handle missing updateStatus callback gracefully", async () => {
      const tool = createFeedbackCollectionTool({
        updateStatus: undefined,
        messages: mockMessages,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test feature",
        useCase: "Test use case",
        currentLimitation: "Test limitation",
      };

      // Should not throw when updateStatus is undefined
      await expect(tool.execute(input)).resolves.toEqual({
        success: true,
        message: "Feature request submitted successfully! Created GitHub issue #123: Feature Request: Advanced Search",
        issueUrl: mockIssue.htmlUrl,
        issueNumber: mockIssue.number,
      });
    });
  });

  describe("Return Value Validation", () => {
    it("should return correct structure on success", async () => {
      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: mockMessages,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test feature",
        useCase: "Test use case",
        currentLimitation: "Test limitation",
      };

      const result = await tool.execute(input);

      // Validate structure
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("issueUrl");
      expect(result).toHaveProperty("issueNumber");

      // Validate types
      expect(typeof result.message).toBe("string");
      expect(typeof result.issueUrl).toBe("string");
      expect(typeof result.issueNumber).toBe("number");
    });

    it("should filter message content to text only", async () => {
      const messagesWithNonText: CoreMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Visible text" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } },
            { type: "tool-use", toolUseId: "123", toolName: "test", input: {} },
            { type: "tool-result", toolUseId: "123", content: "result" },
          ],
        },
      ];

      const tool = createFeedbackCollectionTool({
        updateStatus: mockUpdateStatus,
        messages: messagesWithNonText,
      });

      const input: FeedbackCollectionInput = {
        featureDescription: "Test",
        useCase: "Test",
        currentLimitation: "Test",
      };

      await tool.execute(input);

      const callArgs = mockGenerateBRD.mock.calls[0][0];
      expect(callArgs.conversationContext).toBe("[1] User: Visible text");
    });
  });
});