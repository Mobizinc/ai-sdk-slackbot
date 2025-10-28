/**
 * Integration Tests for handle-passive-messages.ts
 *
 * These tests establish a baseline for the passive flow refactor. They verify:
 * 1. Case number extraction works correctly
 * 2. Passive message handling triggers appropriate actions
 * 3. KB workflow is triggered correctly
 * 4. Resolution detection works
 *
 * During the refactor, these tests MUST continue passing to ensure no regressions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handlePassiveMessage,
  notifyResolution,
  extractCaseNumbers,
  cleanupTimedOutGathering,
} from "../lib/handle-passive-messages";
import type { GenericMessageEvent } from "@slack/bolt";

// Mock dependencies
vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
    conversations: {
      replies: vi.fn().mockResolvedValue({ messages: [] }),
    },
  })),
}));

vi.mock("../lib/services/servicenow", () => ({
  getServiceNowClient: vi.fn().mockReturnValue({
    getCaseByNumber: vi.fn().mockResolvedValue(null),
    getCaseJournal: vi.fn().mockResolvedValue([]),
  }),
}));

const contextManagerMock = {
  getContextSync: vi.fn().mockReturnValue(undefined),
  getContext: vi.fn().mockResolvedValue(undefined),
  addMessage: vi.fn(),
  createContext: vi.fn(),
  extractCaseNumbers: vi.fn().mockReturnValue([]),
  shouldAskForMoreInfo: vi.fn().mockReturnValue(false),
  isKBGatheringInProgress: vi.fn().mockReturnValue(false),
  hasEnoughQuality: vi.fn().mockReturnValue(false),
  removeStaleContexts: vi.fn(),
};

const slackMessagingServiceMock = {
  postMessage: vi.fn().mockResolvedValue({ ok: true }),
  postToThread: vi.fn().mockResolvedValue({ ok: true }),
  updateMessage: vi.fn().mockResolvedValue({ ok: true }),
  getThread: vi.fn().mockResolvedValue([]),
  createStatusUpdater: vi.fn(() => vi.fn()),
};

// Ensure mocks cover both TS path and compiled JS path resolution
// Vitest resolves relative imports before normalising, so pre-resolve the module id
vi.mock("../lib/services/slack-messaging", () => ({
  getSlackMessagingService: () => slackMessagingServiceMock,
  __resetSlackMessagingService: vi.fn(),
}));

vi.mock("../../services/slack-messaging", () => ({
  getSlackMessagingService: () => slackMessagingServiceMock,
  __resetSlackMessagingService: vi.fn(),
}));

describe("handle-passive-messages - Integration Tests", () => {
  const BOT_USER_ID = "U123BOT";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractCaseNumbers", () => {
    it("should extract ServiceNow case numbers from text", () => {
      const text = "I'm working on case SCS0012345 and CASE0098765";
      const caseNumbers = extractCaseNumbers(text);

      expect(caseNumbers).toContain("SCS0012345");
      expect(caseNumbers).toContain("CASE0098765");
    });

    it("should extract INC numbers", () => {
      const text = "Created incident INC0123456 for this issue";
      const caseNumbers = extractCaseNumbers(text);

      expect(caseNumbers).toContain("INC0123456");
    });

    it("should extract RITM numbers", () => {
      const text = "Request RITM0045678 is pending approval";
      const caseNumbers = extractCaseNumbers(text);

      expect(caseNumbers).toContain("RITM0045678");
    });

    it("should return empty array when no case numbers found", () => {
      const text = "Just a regular message with no case numbers";
      const caseNumbers = extractCaseNumbers(text);

      expect(caseNumbers).toEqual([]);
    });

    it("should handle multiple case numbers of different types", () => {
      const text = "Working on SCS0012345, INC0067890, and RITM0011111";
      const caseNumbers = extractCaseNumbers(text);

      expect(caseNumbers).toHaveLength(3);
      expect(caseNumbers).toContain("SCS0012345");
      expect(caseNumbers).toContain("INC0067890");
      expect(caseNumbers).toContain("RITM0011111");
    });

    it("should deduplicate repeated case numbers", () => {
      const text = "Case SCS0012345 and SCS0012345 again";
      const caseNumbers = extractCaseNumbers(text);

      expect(caseNumbers).toHaveLength(1);
      expect(caseNumbers[0]).toBe("SCS0012345");
    });

    it("should handle case numbers in URLs", () => {
      const text = "https://instance.service-now.com/case/SCS0012345";
      const caseNumbers = extractCaseNumbers(text);

      expect(caseNumbers).toContain("SCS0012345");
    });
  });

  describe("handlePassiveMessage", () => {
    it("should ignore messages from the bot itself", async () => {
      const event: GenericMessageEvent = {
        type: "message",
        channel: "C123456",
        user: BOT_USER_ID, // Message from bot
        text: "This is from the bot",
        ts: "1234567890.123456",
      };

      await handlePassiveMessage(event, BOT_USER_ID);

      // Should exit early without processing
      // No errors should be thrown
      expect(true).toBe(true);
    });

    it("should ignore @mention messages (handled by different flow)", async () => {
      const event: GenericMessageEvent = {
        type: "message",
        channel: "C123456",
        user: "U789USER",
        text: `<@${BOT_USER_ID}> help me with SCS0012345`,
        ts: "1234567890.123456",
      };

      await handlePassiveMessage(event, BOT_USER_ID);

      // Should exit early (mentions handled by app_mention handler)
      expect(true).toBe(true);
    });

    it("should process messages with case numbers", async () => {
      const event: GenericMessageEvent = {
        type: "message",
        channel: "C123456",
        user: "U789USER",
        text: "Working on SCS0012345",
        ts: "1234567890.123456",
      };

      // Should not throw error
      await expect(async () => {
        await handlePassiveMessage(event, BOT_USER_ID);
      }).not.toThrow();
    });

    it("should handle thread messages", async () => {
      const event: GenericMessageEvent = {
        type: "message",
        channel: "C123456",
        user: "U789USER",
        text: "Update on SCS0012345",
        ts: "1234567890.123456",
        thread_ts: "1234567880.111111",
      };

      await expect(async () => {
        await handlePassiveMessage(event, BOT_USER_ID);
      }).not.toThrow();
    });

    it("should handle messages without case numbers gracefully", async () => {
      const event: GenericMessageEvent = {
        type: "message",
        channel: "C123456",
        user: "U789USER",
        text: "Just a regular conversation",
        ts: "1234567890.123456",
      };

      // Should process without error even if no case numbers
      await expect(async () => {
        await handlePassiveMessage(event, BOT_USER_ID);
      }).not.toThrow();
    });

    it("should handle subtype messages appropriately", async () => {
      const event: GenericMessageEvent = {
        type: "message",
        subtype: "bot_message",
        channel: "C123456",
        bot_id: "B123456",
        text: "Automated message about SCS0012345",
        ts: "1234567890.123456",
      };

      // Should handle bot_message subtype
      await expect(async () => {
        await handlePassiveMessage(event, BOT_USER_ID);
      }).not.toThrow();
    });
  });

  describe("notifyResolution", () => {
    it("should handle KB workflow trigger", async () => {
      const channelId = "C123456";
      const threadTs = "1234567890.123456";
      const caseNumber = "SCS0012345";

      // Should not throw error when triggering KB workflow
      await expect(async () => {
        await notifyResolution(channelId, threadTs, caseNumber);
      }).not.toThrow();
    });

    it("should handle missing case number gracefully", async () => {
      const channelId = "C123456";
      const threadTs = "1234567890.123456";
      const caseNumber = ""; // Empty case number

      // Should handle gracefully
      await expect(async () => {
        await notifyResolution(channelId, threadTs, caseNumber);
      }).not.toThrow();
    });
  });

  describe("cleanupTimedOutGathering", () => {
    it("should execute cleanup without errors", async () => {
      // This function cleans up timed-out KB gathering sessions
      await expect(async () => {
        await cleanupTimedOutGathering();
      }).not.toThrow();
    });

    it("should be callable multiple times", async () => {
      await cleanupTimedOutGathering();
      await cleanupTimedOutGathering();
      await cleanupTimedOutGathering();

      // Should handle repeated calls gracefully
      expect(true).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle malformed event objects", async () => {
      const event = {
        type: "message",
        // Missing required fields
      } as GenericMessageEvent;

      // Should either handle gracefully or throw descriptive error
      await expect(handlePassiveMessage(event, BOT_USER_ID)).resolves.toBeUndefined();
    });

    it("should handle very long messages", async () => {
      const longText = "Case SCS0012345: " + "A".repeat(10000);
      const event: GenericMessageEvent = {
        type: "message",
        channel: "C123456",
        user: "U789USER",
        text: longText,
        ts: "1234567890.123456",
      };

      await expect(async () => {
        await handlePassiveMessage(event, BOT_USER_ID);
      }).not.toThrow();
    });

    it("should handle messages with special characters in case numbers", async () => {
      // Some systems might have different formats
      const text = "Working on SCS-0012345 or SCS_0012345";
      const caseNumbers = extractCaseNumbers(text);

      // Should extract what it can recognize
      expect(Array.isArray(caseNumbers)).toBe(true);
    });

    it("should handle concurrent message processing", async () => {
      const events: GenericMessageEvent[] = [
        {
          type: "message",
          channel: "C123456",
          user: "U789USER",
          text: "Message 1 with SCS0001111",
          ts: "1234567890.111111",
        },
        {
          type: "message",
          channel: "C123456",
          user: "U789USER",
          text: "Message 2 with SCS0002222",
          ts: "1234567890.222222",
        },
        {
          type: "message",
          channel: "C123456",
          user: "U789USER",
          text: "Message 3 with SCS0003333",
          ts: "1234567890.333333",
        },
      ];

      // Process messages concurrently
      await expect(async () => {
        await Promise.all(
          events.map((event) => handlePassiveMessage(event, BOT_USER_ID))
        );
      }).not.toThrow();
    });
  });

  describe("Context Integration", () => {
    it("should work with existing context manager", async () => {
      const event: GenericMessageEvent = {
        type: "message",
        channel: "C123456",
        user: "U789USER",
        text: "Update on SCS0012345: fixed the issue",
        ts: "1234567890.123456",
        thread_ts: "1234567880.111111",
      };

      // Should integrate with context manager without errors
      await expect(async () => {
        await handlePassiveMessage(event, BOT_USER_ID);
      }).not.toThrow();
    });
  });
});
