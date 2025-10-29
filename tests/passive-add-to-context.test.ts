/**
 * Unit Tests for Add To Context Action
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AddToContextAction,
  getAddToContextAction,
  __resetAddToContextAction,
  __setAddToContextAction,
} from "../lib/passive/actions/add-to-context";
import type { ContextManager, CaseContext } from "../lib/context-manager";
import type { GenericMessageEvent } from "../lib/slack-event-types";

describe("AddToContextAction", () => {
  let mockContextManager: Partial<ContextManager>;
  let action: AddToContextAction;

  const createMockContext = (
    overrides: Partial<CaseContext> = {}
  ): CaseContext => ({
    caseNumber: "SCS0001234",
    channelId: "C123456",
    threadTs: "1234567890.123456",
    channelName: "test-channel",
    messages: [],
    isResolved: false,
    hasPostedAssistance: false,
    _notified: false,
    ...overrides,
  });

  const createMockEvent = (
    overrides: Partial<GenericMessageEvent> = {}
  ): GenericMessageEvent => ({
    type: "message",
    channel: "C123456",
    user: "U123456",
    text: "Test message",
    ts: "1234567890.123456",
    ...overrides,
  });

  beforeEach(() => {
    // Create a mock ContextManager
    mockContextManager = {
      addMessage: vi.fn(),
      getContextSync: vi.fn().mockReturnValue(createMockContext()),
      contexts: new Map([
        [
          "SCS0001234:1234567890.123456",
          createMockContext({
            caseNumber: "SCS0001234",
            threadTs: "1234567890.123456",
            channelId: "C123456",
          }),
        ],
        [
          "INC0005678:1234567890.123456",
          createMockContext({
            caseNumber: "INC0005678",
            threadTs: "1234567890.123456",
            channelId: "C123456",
          }),
        ],
      ]) as any,
    };

    action = new AddToContextAction({
      contextManager: mockContextManager as ContextManager,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetAddToContextAction();
  });

  describe("addMessageToCase", () => {
    it("should add a message to the context manager", () => {
      const messageInfo = {
        user: "U123456",
        text: "Test message",
        timestamp: "1234567890.123456",
        thread_ts: "1234567890.123456",
      };

      action.addMessageToCase(
        "SCS0001234",
        "C123456",
        "1234567890.123456",
        messageInfo
      );

      expect(mockContextManager.addMessage).toHaveBeenCalledWith(
        "SCS0001234",
        "C123456",
        "1234567890.123456",
        messageInfo
      );
    });

    it("should handle message without thread_ts", () => {
      const messageInfo = {
        user: "U123456",
        text: "Test message",
        timestamp: "1234567890.123456",
      };

      action.addMessageToCase(
        "SCS0001234",
        "C123456",
        "1234567890.123456",
        messageInfo
      );

      expect(mockContextManager.addMessage).toHaveBeenCalled();
    });
  });

  describe("addMessageFromEvent", () => {
    it("should extract message info from event and add to context", () => {
      const event = createMockEvent({
        user: "U123456",
        text: "Test message",
        ts: "1234567890.123456",
        thread_ts: "1234567880.111111",
      });

      action.addMessageFromEvent("SCS0001234", event);

      expect(mockContextManager.addMessage).toHaveBeenCalledWith(
        "SCS0001234",
        "C123456",
        "1234567880.111111",
        {
          user: "U123456",
          text: "Test message",
          timestamp: "1234567890.123456",
          thread_ts: "1234567880.111111",
        }
      );
    });

    it("should use ts as threadTs when thread_ts is not present", () => {
      const event = createMockEvent({
        user: "U123456",
        text: "Main thread message",
        ts: "1234567890.123456",
      });

      action.addMessageFromEvent("SCS0001234", event);

      expect(mockContextManager.addMessage).toHaveBeenCalledWith(
        "SCS0001234",
        "C123456",
        "1234567890.123456",
        {
          user: "U123456",
          text: "Main thread message",
          timestamp: "1234567890.123456",
          thread_ts: undefined,
        }
      );
    });

    it("should handle event with missing user", () => {
      const event = createMockEvent({
        user: undefined,
        text: "Bot message",
        ts: "1234567890.123456",
      });

      action.addMessageFromEvent("SCS0001234", event);

      expect(mockContextManager.addMessage).toHaveBeenCalledWith(
        "SCS0001234",
        "C123456",
        "1234567890.123456",
        expect.objectContaining({
          user: "unknown",
        })
      );
    });

    it("should handle event with missing text", () => {
      const event = createMockEvent({
        user: "U123456",
        text: undefined,
        ts: "1234567890.123456",
      });

      action.addMessageFromEvent("SCS0001234", event);

      expect(mockContextManager.addMessage).toHaveBeenCalledWith(
        "SCS0001234",
        "C123456",
        "1234567890.123456",
        expect.objectContaining({
          text: "",
        })
      );
    });
  });

  describe("updateChannelInfo", () => {
    it("should update channel name", () => {
      const context = createMockContext();
      mockContextManager.getContextSync = vi.fn().mockReturnValue(context);

      action.updateChannelInfo("SCS0001234", "1234567890.123456", {
        channelName: "support-channel",
      });

      expect(context.channelName).toBe("support-channel");
    });

    it("should update channel topic", () => {
      const context = createMockContext();
      mockContextManager.getContextSync = vi.fn().mockReturnValue(context);

      action.updateChannelInfo("SCS0001234", "1234567890.123456", {
        channelTopic: "Support discussions",
      });

      expect((context as any).channelTopic).toBe("Support discussions");
    });

    it("should update channel purpose", () => {
      const context = createMockContext();
      mockContextManager.getContextSync = vi.fn().mockReturnValue(context);

      action.updateChannelInfo("SCS0001234", "1234567890.123456", {
        channelPurpose: "Help channel",
      });

      expect((context as any).channelPurpose).toBe("Help channel");
    });

    it("should update multiple channel properties", () => {
      const context = createMockContext();
      mockContextManager.getContextSync = vi.fn().mockReturnValue(context);

      action.updateChannelInfo("SCS0001234", "1234567890.123456", {
        channelName: "support-channel",
        channelTopic: "Support discussions",
        channelPurpose: "Help channel",
      });

      expect(context.channelName).toBe("support-channel");
      expect((context as any).channelTopic).toBe("Support discussions");
      expect((context as any).channelPurpose).toBe("Help channel");
    });

    it("should warn when context not found", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockContextManager.getContextSync = vi.fn().mockReturnValue(null);

      action.updateChannelInfo("SCS0001234", "1234567890.123456", {
        channelName: "support-channel",
      });

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("markAssistancePosted", () => {
    it("should mark assistance as posted", () => {
      const context = createMockContext({ hasPostedAssistance: false });
      mockContextManager.getContextSync = vi.fn().mockReturnValue(context);

      action.markAssistancePosted("SCS0001234", "1234567890.123456");

      expect(context.hasPostedAssistance).toBe(true);
    });

    it("should handle context not found gracefully", () => {
      mockContextManager.getContextSync = vi.fn().mockReturnValue(null);

      // Should not throw
      action.markAssistancePosted("SCS0001234", "1234567890.123456");
    });
  });

  describe("markResolutionNotified", () => {
    it("should mark resolution as notified", () => {
      const context = createMockContext({ _notified: false });
      mockContextManager.getContextSync = vi.fn().mockReturnValue(context);

      action.markResolutionNotified("SCS0001234", "1234567890.123456");

      expect(context._notified).toBe(true);
    });

    it("should handle context not found gracefully", () => {
      mockContextManager.getContextSync = vi.fn().mockReturnValue(null);

      // Should not throw
      action.markResolutionNotified("SCS0001234", "1234567890.123456");
    });
  });

  describe("resetResolutionFlag", () => {
    it("should reset resolution flag to false", () => {
      const context = createMockContext({ isResolved: true });
      mockContextManager.getContextSync = vi.fn().mockReturnValue(context);

      action.resetResolutionFlag("SCS0001234", "1234567890.123456");

      expect(context.isResolved).toBe(false);
    });

    it("should handle context not found gracefully", () => {
      mockContextManager.getContextSync = vi.fn().mockReturnValue(null);

      // Should not throw
      action.resetResolutionFlag("SCS0001234", "1234567890.123456");
    });
  });

  describe("getContext", () => {
    it("should return context from context manager", () => {
      const expectedContext = createMockContext();
      mockContextManager.getContextSync = vi.fn().mockReturnValue(expectedContext);

      const result = action.getContext("SCS0001234", "1234567890.123456");

      expect(result).toBe(expectedContext);
      expect(mockContextManager.getContextSync).toHaveBeenCalledWith(
        "SCS0001234",
        "1234567890.123456"
      );
    });

    it("should return null when context not found", () => {
      mockContextManager.getContextSync = vi.fn().mockReturnValue(null);

      const result = action.getContext("NOTFOUND", "1234567890.123456");

      expect(result).toBeNull();
    });
  });

  describe("findContextsForThread", () => {
    it("should find all contexts for a thread", () => {
      const result = action.findContextsForThread("C123456", "1234567890.123456");

      expect(result).toHaveLength(2);
      expect(result[0].caseNumber).toBe("SCS0001234");
      expect(result[1].caseNumber).toBe("INC0005678");
    });

    it("should filter by channel ID", () => {
      mockContextManager.contexts = new Map([
        [
          "SCS0001234:1234567890.123456",
          createMockContext({
            caseNumber: "SCS0001234",
            threadTs: "1234567890.123456",
            channelId: "C123456",
          }),
        ],
        [
          "INC0005678:1234567890.123456",
          createMockContext({
            caseNumber: "INC0005678",
            threadTs: "1234567890.123456",
            channelId: "C999999",
          }),
        ],
      ]) as any;

      const result = action.findContextsForThread("C123456", "1234567890.123456");

      expect(result).toHaveLength(1);
      expect(result[0].caseNumber).toBe("SCS0001234");
    });

    it("should filter by thread timestamp", () => {
      mockContextManager.contexts = new Map([
        [
          "SCS0001234:1234567890.123456",
          createMockContext({
            caseNumber: "SCS0001234",
            threadTs: "1234567890.123456",
            channelId: "C123456",
          }),
        ],
        [
          "INC0005678:9999999999.999999",
          createMockContext({
            caseNumber: "INC0005678",
            threadTs: "9999999999.999999",
            channelId: "C123456",
          }),
        ],
      ]) as any;

      const result = action.findContextsForThread("C123456", "1234567890.123456");

      expect(result).toHaveLength(1);
      expect(result[0].caseNumber).toBe("SCS0001234");
    });

    it("should return empty array when no contexts match", () => {
      const result = action.findContextsForThread("C999999", "9999999999.999999");

      expect(result).toEqual([]);
    });
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const mockAction = new AddToContextAction({
        contextManager: mockContextManager as ContextManager,
      });
      __setAddToContextAction(mockAction);

      const instance1 = getAddToContextAction();
      const instance2 = getAddToContextAction();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const mockAction1 = new AddToContextAction({
        contextManager: mockContextManager as ContextManager,
      });
      __setAddToContextAction(mockAction1);

      const instance1 = getAddToContextAction();

      __resetAddToContextAction();

      const mockAction2 = new AddToContextAction({
        contextManager: mockContextManager as ContextManager,
      });
      __setAddToContextAction(mockAction2);

      const instance2 = getAddToContextAction();

      expect(instance1).not.toBe(instance2);
    });

    it("should allow setting custom instance", () => {
      const customAction = new AddToContextAction({
        contextManager: mockContextManager as ContextManager,
      });
      __setAddToContextAction(customAction);

      const instance = getAddToContextAction();
      expect(instance).toBe(customAction);
    });
  });
});
