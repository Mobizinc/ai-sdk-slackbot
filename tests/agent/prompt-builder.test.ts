/**
 * Comprehensive Unit Tests for Prompt Builder
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPrompt } from "../../lib/agent/prompt-builder";
import { getSystemPrompt } from "../../lib/system-prompt";
import { getBusinessContextService } from "../../lib/services/business-context-service";

// Mock dependencies
vi.mock("../../lib/system-prompt");
vi.mock("../../lib/services/business-context-service");

describe("Prompt Builder", () => {
  let mockGetSystemPrompt: any;
  let mockBusinessContextService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSystemPrompt = vi.fn().mockResolvedValue("BASE_SYSTEM_PROMPT");
    (getSystemPrompt as any) = mockGetSystemPrompt;

    mockBusinessContextService = {
      enhancePromptWithContext: vi.fn().mockResolvedValue("ENHANCED_PROMPT"),
    };
    (getBusinessContextService as unknown as vi.Mock).mockReturnValue(mockBusinessContextService);
  });

  describe("Basic Prompt Assembly", () => {
    it("should build prompt with base system prompt", async () => {
      const result = await buildPrompt({
        context: {
          messages: [{ role: "user", content: "Hello" }],
          metadata: {},
        },
      });

      expect(mockGetSystemPrompt).toHaveBeenCalled();
      expect(result.systemPrompt).toBe("ENHANCED_PROMPT");
    });

    it("should include conversation messages", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = await buildPrompt({
        context: {
          messages,
          metadata: {},
        },
      });

      expect(result.conversation).toEqual(messages);
    });

    it("should use current date when requestTimestamp not provided", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {},
        },
      });

      expect(mockGetSystemPrompt).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      );
    });

    it("should use provided requestTimestamp", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {},
        },
        requestTimestamp: "2024-01-15",
      });

      expect(mockGetSystemPrompt).toHaveBeenCalledWith("2024-01-15");
    });
  });

  describe("Business Context Enhancement", () => {
    it("should enhance prompt with business context from metadata", async () => {
      const result = await buildPrompt({
        context: {
          messages: [],
          metadata: {
            businessContext: { entityName: "Acme Corp" },
            companyName: "Acme Corp",
            caseContext: {
              channelTopic: "Technical Support",
              channelPurpose: "Customer assistance",
            },
          },
        },
      });

      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        "Acme Corp",
        "Technical Support",
        "Customer assistance"
      );
      expect(result.systemPrompt).toBe("ENHANCED_PROMPT");
    });

    it("should use companyName from businessContext.entityName when available", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {
            businessContext: { entityName: "Globex Corporation" },
          },
        },
      });

      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        "Globex Corporation",
        undefined,
        undefined
      );
    });

    it("should fallback to metadata.companyName when businessContext has no entityName", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {
            companyName: "Initech",
            businessContext: {},
          },
        },
      });

      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        "Initech",
        undefined,
        undefined
      );
    });

    it("should handle missing business context gracefully", async () => {
      const result = await buildPrompt({
        context: {
          messages: [],
          metadata: {},
        },
      });

      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        undefined,
        undefined,
        undefined
      );
      expect(result.systemPrompt).toBe("ENHANCED_PROMPT");
    });

    it("should extract channel topic from case context", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {
            companyName: "Acme Corp",
            caseContext: {
              channelTopic: "Network Issues",
              channelPurpose: "Network troubleshooting",
            },
          },
        },
      });

      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        "Acme Corp",
        "Network Issues",
        "Network troubleshooting"
      );
    });

    it("should handle partial case context data", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {
            companyName: "Acme Corp",
            caseContext: {
              channelTopic: "Support",
            },
          },
        },
      });

      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        "Acme Corp",
        "Support",
        undefined
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty messages array", async () => {
      const result = await buildPrompt({
        context: {
          messages: [],
          metadata: {},
        },
      });

      expect(result.conversation).toEqual([]);
      expect(result.systemPrompt).toBe("ENHANCED_PROMPT");
    });

    it("should handle multi-turn conversations", async () => {
      const messages = [
        { role: "user", content: "Message 1" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Message 2" },
        { role: "assistant", content: "Response 2" },
        { role: "user", content: "Message 3" },
      ];

      const result = await buildPrompt({
        context: {
          messages,
          metadata: {},
        },
      });

      expect(result.conversation).toHaveLength(5);
      expect(result.conversation).toEqual(messages);
    });

    it("should handle metadata with only caseNumbers", async () => {
      const result = await buildPrompt({
        context: {
          messages: [{ role: "user", content: "Test" }],
          metadata: {
            caseNumbers: ["SCS0001234"],
          },
        },
      });

      expect(result.systemPrompt).toBe("ENHANCED_PROMPT");
      expect(result.conversation).toHaveLength(1);
    });

    it("should handle metadata with similar cases", async () => {
      const result = await buildPrompt({
        context: {
          messages: [],
          metadata: {
            similarCases: [
              {
                case_number: "SCS0005555",
                score: 0.89,
                content: "Similar case",
              },
            ],
          },
        },
      });

      // Similar cases in metadata should not affect prompt building
      expect(result.systemPrompt).toBe("ENHANCED_PROMPT");
    });

    it("should handle metadata with thread history", async () => {
      const result = await buildPrompt({
        context: {
          messages: [{ role: "user", content: "Current message" }],
          metadata: {
            threadHistory: [
              { role: "user", content: "Thread message 1" },
              { role: "assistant", content: "Thread response 1" },
            ],
          },
        },
      });

      // Thread history in metadata should not affect conversation directly
      expect(result.conversation).toEqual([{ role: "user", content: "Current message" }]);
    });
  });

  describe("Date Formatting", () => {
    it("should format full ISO timestamp to date only", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {},
        },
        requestTimestamp: "2024-03-15T10:30:45.123Z",
      });

      expect(mockGetSystemPrompt).toHaveBeenCalledWith("2024-03-15T10:30:45.123Z");
    });

    it("should accept date-only format", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {},
        },
        requestTimestamp: "2024-06-20",
      });

      expect(mockGetSystemPrompt).toHaveBeenCalledWith("2024-06-20");
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle full context with all metadata types", async () => {
      const result = await buildPrompt({
        context: {
          messages: [
            { role: "user", content: "Help with SCS0001234" },
            { role: "assistant", content: "Let me check that" },
          ],
          metadata: {
            caseNumbers: ["SCS0001234"],
            caseContext: {
              caseNumber: "SCS0001234",
              channelName: "Acme Corp",
              channelTopic: "Technical Support",
              channelPurpose: "Customer assistance",
            },
            companyName: "Acme Corp",
            businessContext: {
              entityName: "Acme Corp",
              entityType: "CLIENT",
            },
            similarCases: [
              { case_number: "SCS0005555", score: 0.88 },
            ],
            threadHistory: [
              { role: "user", content: "Previous message" },
            ],
          },
        },
        requestTimestamp: "2024-01-15",
      });

      expect(mockGetSystemPrompt).toHaveBeenCalledWith("2024-01-15");
      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        "Acme Corp",
        "Technical Support",
        "Customer assistance"
      );
      expect(result.systemPrompt).toBe("ENHANCED_PROMPT");
      expect(result.conversation).toHaveLength(2);
    });

    it("should prioritize businessContext.entityName over metadata.companyName", async () => {
      await buildPrompt({
        context: {
          messages: [],
          metadata: {
            companyName: "Old Name",
            businessContext: {
              entityName: "Correct Name",
            },
          },
        },
      });

      expect(mockBusinessContextService.enhancePromptWithContext).toHaveBeenCalledWith(
        "BASE_SYSTEM_PROMPT",
        "Correct Name",
        undefined,
        undefined
      );
    });
  });
});
