/**
 * GitHub Issue Service Tests
 *
 * Tests GitHub issue creation from BRDs including API integration,
 * configuration validation, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";

// Mock GitHub client
vi.mock("../../lib/integrations/github/client", () => ({
  getGitHubClient: vi.fn(),
}));

// Mock config
vi.mock("../../lib/config", () => ({
  getConfigValue: vi.fn(),
}));

// Import service and mocked dependencies after mocking
import {
  createGitHubIssue,
  type CreateIssueParams,
  type CreatedIssue,
} from "../../lib/services/github-issue-service";
import type { GeneratedBRD } from "../../lib/services/brd-generator";
import { getGitHubClient } from "../../lib/integrations/github/client";
import { getConfigValue } from "../../lib/config";

describe("GitHub Issue Service", () => {
  const mockCreate = vi.fn();
  const mockGitHubClient = {
    issues: {
      create: mockCreate,
    },
  };

  const mockBRD: GeneratedBRD = {
    title: "Feature Request: Advanced Search",
    problemStatement: "Users need better search capabilities",
    userStory: "As a user, I want to search effectively",
    acceptanceCriteria: ["Criteria 1", "Criteria 2", "Criteria 3"],
    technicalContext: "Technical implementation details",
    conversationTranscript: "User: I need better search",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup GitHub client mock
    (getGitHubClient as Mock).mockResolvedValue(mockGitHubClient);

    // Setup config mock
    (getConfigValue as Mock).mockImplementation((key: string) => {
      const configs: Record<string, string> = {
        githubFeedbackRepo: "TestOwner/test-repo",
        githubFeedbackLabels: "feature-request,user-feedback",
      };
      return configs[key];
    });

    // Default successful response
    mockCreate.mockResolvedValue({
      data: {
        number: 123,
        html_url: "https://github.com/TestOwner/test-repo/issues/123",
        title: "Feature Request: Advanced Search",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Issue Creation", () => {
    it("should successfully create issue with complete BRD", async () => {
      const params: CreateIssueParams = {
        brd: mockBRD,
        slackThreadUrl: "https://slack.com/archives/C123/p456",
        requestedBy: "john.doe",
      };

      const result = await createGitHubIssue(params);

      expect(result).toEqual({
        number: 123,
        htmlUrl: "https://github.com/TestOwner/test-repo/issues/123",
        title: "Feature Request: Advanced Search",
      });

      expect(mockCreate).toHaveBeenCalledWith({
        owner: "TestOwner",
        repo: "test-repo",
        title: "Feature Request: Advanced Search",
        body: expect.stringContaining("## Problem Statement"),
        labels: ["feature-request", "user-feedback"],
      });
    });

    it("should format issue body correctly", async () => {
      const params: CreateIssueParams = {
        brd: mockBRD,
        slackThreadUrl: "https://slack.com/archives/C123/p456",
        requestedBy: "jane.smith",
      };

      await createGitHubIssue(params);

      const callArgs = mockCreate.mock.calls[0][0];
      const body = callArgs.body;

      // Check all sections are present
      expect(body).toContain("## Request Information");
      expect(body).toContain("**Requested by:** jane.smith");
      expect(body).toContain("**Slack Thread:** https://slack.com/archives/C123/p456");
      expect(body).toContain("## Problem Statement");
      expect(body).toContain("Users need better search capabilities");
      expect(body).toContain("## User Story");
      expect(body).toContain("As a user, I want to search effectively");
      expect(body).toContain("## Acceptance Criteria");
      expect(body).toContain("- [ ] Criteria 1");
      expect(body).toContain("- [ ] Criteria 2");
      expect(body).toContain("- [ ] Criteria 3");
      expect(body).toContain("## Technical Context");
      expect(body).toContain("Technical implementation details");
      expect(body).toContain("## Conversation Transcript");
      expect(body).toContain("User: I need better search");
      expect(body).toContain("_This issue was automatically generated from user feedback via the Slack bot._");
    });

    it("should handle optional parameters correctly", async () => {
      // Without optional parameters
      const params: CreateIssueParams = {
        brd: {
          ...mockBRD,
          conversationTranscript: undefined,
        },
      };

      await createGitHubIssue(params);

      const callArgs = mockCreate.mock.calls[0][0];
      const body = callArgs.body;

      expect(body).not.toContain("## Request Information");
      expect(body).not.toContain("**Requested by:**");
      expect(body).not.toContain("**Slack Thread:**");
      expect(body).not.toContain("## Conversation Transcript");
    });
  });

  describe("Configuration Validation", () => {
    it("should handle missing GitHub App configuration with user-friendly error", async () => {
      (getGitHubClient as Mock).mockRejectedValueOnce(new Error("GitHub App not configured"));

      const params: CreateIssueParams = {
        brd: mockBRD,
      };

      await expect(createGitHubIssue(params)).rejects.toThrow(
        "GitHub App is not configured. Please set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_INSTALLATION_ID environment variables to enable feedback collection."
      );
    });

    it("should validate repository format", async () => {
      // Test with a single invalid format first
      (getConfigValue as Mock).mockImplementation((key: string) => {
        if (key === "githubFeedbackRepo") return "justarepo"; // Invalid format - no slash
        if (key === "githubFeedbackLabels") return "feature-request,user-feedback";
        return undefined;
      });

      const params: CreateIssueParams = {
        brd: mockBRD,
      };

      await expect(createGitHubIssue(params)).rejects.toThrow(
        "Invalid GitHub repository format: justarepo. Expected format: owner/repo"
      );
    });

    it("should parse labels correctly", async () => {
      (getConfigValue as Mock).mockImplementation((key: string) => {
        if (key === "githubFeedbackRepo") return "TestOwner/test-repo";
        if (key === "githubFeedbackLabels") return "bug, enhancement , feature-request ";
        return undefined;
      });

      const params: CreateIssueParams = {
        brd: mockBRD,
      };

      await createGitHubIssue(params);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.labels).toEqual(["bug", "enhancement", "feature-request"]);
    });

    it("should use default repository and labels when not configured", async () => {
      (getConfigValue as Mock).mockReturnValue(undefined);

      const params: CreateIssueParams = {
        brd: mockBRD,
      };

      await createGitHubIssue(params);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.owner).toBe("Mobizinc");
      expect(callArgs.repo).toBe("ai-sdk-slackbot");
      expect(callArgs.labels).toEqual(["feature-request", "user-feedback"]);
    });
  });

  describe("GitHub API Error Handling", () => {
    it("should handle GitHub API failures", async () => {
      mockCreate.mockRejectedValueOnce(new Error("GitHub API rate limit exceeded"));

      const params: CreateIssueParams = {
        brd: mockBRD,
      };

      await expect(createGitHubIssue(params)).rejects.toThrow("GitHub API rate limit exceeded");
    });

    it("should handle invalid installation ID", async () => {
      (getGitHubClient as Mock).mockRejectedValueOnce(new Error("Invalid installation ID"));

      const params: CreateIssueParams = {
        brd: mockBRD,
      };

      await expect(createGitHubIssue(params)).rejects.toThrow(
        "GitHub App is not configured. Please set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_INSTALLATION_ID environment variables to enable feedback collection."
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty acceptance criteria", async () => {
      const params: CreateIssueParams = {
        brd: {
          ...mockBRD,
          acceptanceCriteria: [],
        },
      };

      await createGitHubIssue(params);

      const callArgs = mockCreate.mock.calls[0][0];
      const body = callArgs.body;

      expect(body).toContain("## Acceptance Criteria");
      expect(body).toContain("_No acceptance criteria specified_");
      expect(body).not.toContain("- [ ]");
    });

    it("should handle very long BRD content", async () => {
      const longText = "x".repeat(5000);
      const params: CreateIssueParams = {
        brd: {
          ...mockBRD,
          problemStatement: longText,
          technicalContext: longText,
        },
      };

      await createGitHubIssue(params);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.body.length).toBeGreaterThan(10000);
      expect(callArgs.body).toContain(longText);
    });
  });
});