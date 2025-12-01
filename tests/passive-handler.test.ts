/**
 * Unit Tests for Passive Handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handlePassiveMessage,
  notifyResolution,
  cleanupTimedOutGathering,
} from "../lib/passive/handler";
import { __resetCaseDetectionDebouncer, __resetAssistanceCooldowns } from "../lib/passive/handler-utils";
import type { GenericMessageEvent } from "../lib/slack-event-types";

// Mock all dependencies
vi.mock("../lib/utils/case-number-extractor");
vi.mock("../lib/passive/detectors/resolution-detector");
vi.mock("../lib/passive/actions/add-to-context");
vi.mock("../lib/passive/actions/post-assistance");
vi.mock("../lib/passive/actions/trigger-kb-workflow");
vi.mock("../lib/services/kb-state-machine");
vi.mock("../lib/services/channel-info");

describe("Passive Handler", () => {
  let mockExtractCaseNumbers: any;
  let mockGetResolutionDetector: any;
  let mockGetAddToContextAction: any;
  let mockGetPostAssistanceAction: any;
  let mockGetTriggerKBWorkflowAction: any;
  let mockGetKBStateMachine: any;
  let mockGetChannelInfo: any;

  const createMockEvent = (
    overrides: Partial<GenericMessageEvent> = {}
  ): GenericMessageEvent => ({
    type: "message",
    channel: "C123456",
    user: "U123456",
    text: "Test message with SCS0001234",
    ts: "1234567890.123456",
    ...overrides,
  });

  const createMockContext = (overrides: any = {}) => ({
    caseNumber: "SCS0001234",
    channelId: "C123456",
    threadTs: "1234567890.123456",
    messages: [],
    isResolved: false,
    hasPostedAssistance: false,
    _notified: false,
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    __resetCaseDetectionDebouncer();
    __resetAssistanceCooldowns();

    // Setup mocks
    const caseExtractor = await import("../lib/utils/case-number-extractor");
    const resolutionDetector = await import("../lib/passive/detectors/resolution-detector");
    const addToContext = await import("../lib/passive/actions/add-to-context");
    const postAssistance = await import(
      "../lib/passive/actions/post-assistance"
    );
    const triggerKBWorkflow = await import(
      "../lib/passive/actions/trigger-kb-workflow"
    );
    const kbStateMachine = await import("../lib/services/kb-state-machine");
    const channelInfo = await import("../lib/services/channel-info");

    mockExtractCaseNumbers = caseExtractor.extractCaseNumbers as any;
    mockGetResolutionDetector = resolutionDetector.getResolutionDetector as any;
    mockGetAddToContextAction = addToContext.getAddToContextAction as any;
    mockGetPostAssistanceAction = postAssistance.getPostAssistanceAction as any;
    mockGetTriggerKBWorkflowAction =
      triggerKBWorkflow.getTriggerKBWorkflowAction as any;
    mockGetKBStateMachine = kbStateMachine.getKBStateMachine as any;
    mockGetChannelInfo = channelInfo.getChannelInfo as any;

    // Default mock implementations
    mockExtractCaseNumbers.mockReturnValue([]);

    const mockDetector = {
      shouldTriggerKBWorkflow: vi.fn().mockResolvedValue({
        isResolved: false,
        isValidatedByServiceNow: false,
        reason: "Not resolved",
      }),
    };
    mockGetResolutionDetector.mockReturnValue(mockDetector);

    const mockContextAction = {
      addMessageFromEvent: vi.fn(),
      updateChannelInfo: vi.fn(),
      markAssistancePosted: vi.fn(),
      markResolutionNotified: vi.fn(),
      resetResolutionFlag: vi.fn(),
      getContext: vi.fn().mockReturnValue(null),
      findContextsForThread: vi.fn().mockReturnValue([]),
    };
    mockGetAddToContextAction.mockReturnValue(mockContextAction);

    const mockPostAction = {
      execute: vi.fn().mockResolvedValue(true),
    };
    mockGetPostAssistanceAction.mockReturnValue(mockPostAction);

    const mockKBAction = {
      triggerWorkflow: vi.fn().mockResolvedValue(undefined),
      handleUserResponse: vi.fn().mockResolvedValue(undefined),
      cleanupTimedOut: vi.fn().mockResolvedValue(undefined),
    };
    mockGetTriggerKBWorkflowAction.mockReturnValue(mockKBAction);

    const mockStateMachine = {
      isWaitingForUser: vi.fn().mockReturnValue(false),
    };
    mockGetKBStateMachine.mockReturnValue(mockStateMachine);

    mockGetChannelInfo.mockResolvedValue({
      channelName: "test-channel",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handlePassiveMessage", () => {
    it("should skip bot messages", async () => {
      const event = createMockEvent({ bot_id: "B123456" });

      await handlePassiveMessage(event, "U999999");

      expect(mockExtractCaseNumbers).not.toHaveBeenCalled();
    });

    it("should skip messages from bot user", async () => {
      const event = createMockEvent({ user: "U999999" });

      await handlePassiveMessage(event, "U999999");

      expect(mockExtractCaseNumbers).not.toHaveBeenCalled();
    });

    it("should skip empty messages", async () => {
      const event = createMockEvent({ text: "" });

      await handlePassiveMessage(event, "U999999");

      expect(mockExtractCaseNumbers).not.toHaveBeenCalled();
    });

    it("should skip messages that @mention the bot", async () => {
      const event = createMockEvent({ text: "<@U999999> help me" });

      await handlePassiveMessage(event, "U999999");

      expect(mockExtractCaseNumbers).not.toHaveBeenCalled();
    });

    it("should extract and process case numbers", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(mockExtractCaseNumbers).toHaveBeenCalledWith("Test message with SCS0001234");
    });

    it("should add message to context for detected cases", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(contextAction.addMessageFromEvent).toHaveBeenCalledWith(
        "SCS0001234",
        event
      );
    });

    it("should fetch and update channel info for new cases", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      contextAction.getContext.mockReturnValue(
        createMockContext({ hasPostedAssistance: false })
      );
      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(mockGetChannelInfo).toHaveBeenCalledWith("C123456");
      expect(contextAction.updateChannelInfo).toHaveBeenCalled();
    });

    it("should handle channel info fetch errors gracefully", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      contextAction.getContext.mockReturnValue(
        createMockContext({ hasPostedAssistance: false })
      );
      mockGetChannelInfo.mockRejectedValue(new Error("Channel not found"));
      const event = createMockEvent();

      // Should not throw
      await handlePassiveMessage(event, "U999999");

      expect(contextAction.updateChannelInfo).not.toHaveBeenCalled();
    });

    it("should post assistance for new cases", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      const context = createMockContext({ hasPostedAssistance: false });
      contextAction.getContext.mockReturnValue(context);
      const postAction = mockGetPostAssistanceAction();
      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(postAction.execute).toHaveBeenCalledWith({
        event,
        caseNumber: "SCS0001234",
        context,
      });
    });

    it("should mark assistance as posted after posting", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      contextAction.getContext.mockReturnValue(
        createMockContext({ hasPostedAssistance: false })
      );
      const postAction = mockGetPostAssistanceAction();
      postAction.execute.mockResolvedValue(true);
      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(contextAction.markAssistancePosted).toHaveBeenCalledWith(
        "SCS0001234",
        "1234567890.123456"
      );
    });

    it("should not mark assistance posted if posting failed", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      contextAction.getContext.mockReturnValue(
        createMockContext({ hasPostedAssistance: false })
      );
      const postAction = mockGetPostAssistanceAction();
      postAction.execute.mockResolvedValue(false);
      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(contextAction.markAssistancePosted).not.toHaveBeenCalled();
    });

    it("should process multiple case numbers in one message", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234", "INC0005678"]);
      const contextAction = mockGetAddToContextAction();
      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(contextAction.addMessageFromEvent).toHaveBeenCalledTimes(2);
      expect(contextAction.addMessageFromEvent).toHaveBeenCalledWith(
        "SCS0001234",
        event
      );
      expect(contextAction.addMessageFromEvent).toHaveBeenCalledWith(
        "INC0005678",
        event
      );
    });

    it("should only post assistance once per message even with multiple cases", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234", "INC0005678"]);
      const contextAction = mockGetAddToContextAction();
      contextAction.getContext.mockReturnValue(
        createMockContext({ hasPostedAssistance: false })
      );
      const postAction = mockGetPostAssistanceAction();
      postAction.execute.mockResolvedValue(true);

      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999");

      expect(postAction.execute).toHaveBeenCalledTimes(1);
      expect(contextAction.markAssistancePosted).toHaveBeenCalledTimes(1);
    });

    it("should skip low-value messages without posting assistance", async () => {
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      contextAction.getContext.mockReturnValue(
        createMockContext({ hasPostedAssistance: false })
      );
      const postAction = mockGetPostAssistanceAction();
      const event = createMockEvent({ text: "Thanks SCS0001234" });

      await handlePassiveMessage(event, "U999999");

      expect(postAction.execute).not.toHaveBeenCalled();
      expect(contextAction.markAssistancePosted).not.toHaveBeenCalled();
    });

    it("should respect cooldown and avoid repeated assistance in the same thread", async () => {
      vi.useFakeTimers();
      mockExtractCaseNumbers.mockReturnValue(["SCS0001234"]);
      const contextAction = mockGetAddToContextAction();
      contextAction.getContext.mockReturnValue(
        createMockContext({ hasPostedAssistance: false })
      );
      const postAction = mockGetPostAssistanceAction();
      postAction.execute.mockResolvedValue(true);

      const event = createMockEvent();

      await handlePassiveMessage(event, "U999999"); // first post
      await handlePassiveMessage(event, "U999999"); // should be skipped due to cooldown

      expect(postAction.execute).toHaveBeenCalledTimes(1);

      // Advance beyond cooldown and allow another post
      vi.advanceTimersByTime(13 * 60 * 1000);
      await handlePassiveMessage(event, "U999999");
      expect(postAction.execute).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("should process thread messages for existing contexts", async () => {
      mockExtractCaseNumbers.mockReturnValue([]);
      const contextAction = mockGetAddToContextAction();
      const context = createMockContext();
      contextAction.findContextsForThread.mockReturnValue([context]);
      const event = createMockEvent({ thread_ts: "1234567890.123456" });

      await handlePassiveMessage(event, "U999999");

      expect(contextAction.findContextsForThread).toHaveBeenCalledWith(
        "C123456",
        "1234567890.123456"
      );
    });

    it("should handle user responses in GATHERING state", async () => {
      mockExtractCaseNumbers.mockReturnValue([]);
      const contextAction = mockGetAddToContextAction();
      const context = createMockContext();
      contextAction.findContextsForThread.mockReturnValue([context]);
      const stateMachine = mockGetKBStateMachine();
      stateMachine.isWaitingForUser.mockReturnValue(true);
      const kbAction = mockGetTriggerKBWorkflowAction();
      const event = createMockEvent({
        thread_ts: "1234567890.123456",
        text: "Here is more information",
      });

      await handlePassiveMessage(event, "U999999");

      expect(kbAction.handleUserResponse).toHaveBeenCalledWith(
        context,
        "Here is more information"
      );
    });

    it("should check for resolution in thread messages", async () => {
      mockExtractCaseNumbers.mockReturnValue([]);
      const contextAction = mockGetAddToContextAction();
      const context = createMockContext();
      contextAction.findContextsForThread.mockReturnValue([context]);
      const detector = mockGetResolutionDetector();
      const event = createMockEvent({ thread_ts: "1234567890.123456" });

      await handlePassiveMessage(event, "U999999");

      expect(detector.shouldTriggerKBWorkflow).toHaveBeenCalledWith(context);
    });

    it("should trigger KB workflow when case is resolved", async () => {
      mockExtractCaseNumbers.mockReturnValue([]);
      const contextAction = mockGetAddToContextAction();
      const context = createMockContext();
      contextAction.findContextsForThread.mockReturnValue([context]);
      const detector = mockGetResolutionDetector();
      detector.shouldTriggerKBWorkflow.mockResolvedValue({
        isResolved: true,
        isValidatedByServiceNow: true,
        reason: "Confirmed resolved",
      });
      const kbAction = mockGetTriggerKBWorkflowAction();
      const event = createMockEvent({ thread_ts: "1234567890.123456" });

      await handlePassiveMessage(event, "U999999");

      expect(kbAction.triggerWorkflow).toHaveBeenCalledWith(
        "SCS0001234",
        "C123456",
        "1234567890.123456"
      );
      expect(contextAction.markResolutionNotified).toHaveBeenCalledWith(
        "SCS0001234",
        "1234567890.123456"
      );
    });

    it("should reset resolution flag when ServiceNow doesn't confirm", async () => {
      mockExtractCaseNumbers.mockReturnValue([]);
      const contextAction = mockGetAddToContextAction();
      const context = createMockContext({ isResolved: true });
      contextAction.findContextsForThread.mockReturnValue([context]);
      const detector = mockGetResolutionDetector();
      detector.shouldTriggerKBWorkflow.mockResolvedValue({
        isResolved: false,
        isValidatedByServiceNow: false,
        reason: "ServiceNow doesn't confirm",
      });
      const event = createMockEvent({ thread_ts: "1234567890.123456" });

      await handlePassiveMessage(event, "U999999");

      expect(contextAction.resetResolutionFlag).toHaveBeenCalledWith(
        "SCS0001234",
        "1234567890.123456"
      );
    });
  });

  describe("notifyResolution", () => {
    it("should trigger KB workflow", async () => {
      const kbAction = mockGetTriggerKBWorkflowAction();

      await notifyResolution("SCS0001234", "C123456", "1234567890.123456");

      expect(kbAction.triggerWorkflow).toHaveBeenCalledWith(
        "SCS0001234",
        "C123456",
        "1234567890.123456"
      );
    });
  });

  describe("cleanupTimedOutGathering", () => {
    it("should call cleanup on KB workflow action", async () => {
      const kbAction = mockGetTriggerKBWorkflowAction();

      await cleanupTimedOutGathering();

      expect(kbAction.cleanupTimedOut).toHaveBeenCalled();
    });
  });
});
