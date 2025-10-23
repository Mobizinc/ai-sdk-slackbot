/**
 * Unit Tests for Post Assistance Action
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PostAssistanceAction,
  getPostAssistanceAction,
  __resetPostAssistanceAction,
  __setPostAssistanceAction,
} from "../lib/passive/actions/post-assistance";
import type { SlackMessagingService } from "../lib/services/slack-messaging";
import type { CaseDataService } from "../lib/services/case-data";
import type { SearchFacadeService } from "../lib/services/search-facade";
import type { CaseContext } from "../lib/context-manager";
import type { GenericMessageEvent } from "../lib/slack-event-types";

// Mock the service functions
vi.mock("../lib/services/channel-info");
vi.mock("../lib/services/intelligent-assistant");

describe("PostAssistanceAction", () => {
  let mockSlackMessaging: Partial<SlackMessagingService>;
  let mockCaseData: Partial<CaseDataService>;
  let mockSearchFacade: Partial<SearchFacadeService>;
  let action: PostAssistanceAction;
  let mockGetChannelInfo: any;
  let mockBuildIntelligentAssistance: any;
  let mockShouldProvideAssistance: any;

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

  const mockCaseDetails = {
    number: "SCS0001234",
    sys_id: "abc123",
    state: "New",
    priority: "3 - Moderate",
    short_description: "Test case",
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Import and setup mocks
    const channelInfo = await import("../lib/services/channel-info");
    const intelligentAssistant = await import(
      "../lib/services/intelligent-assistant"
    );

    mockGetChannelInfo = channelInfo.getChannelInfo as any;
    mockBuildIntelligentAssistance =
      intelligentAssistant.buildIntelligentAssistance as any;
    mockShouldProvideAssistance =
      intelligentAssistant.shouldProvideAssistance as any;

    // Reset module mocks to defaults
    mockGetChannelInfo.mockResolvedValue({
      channelName: "test-channel",
      channelTopic: "Test topic",
      channelPurpose: "Test purpose",
    });
    mockBuildIntelligentAssistance.mockResolvedValue(
      "🤖 Intelligent assistance message"
    );
    mockShouldProvideAssistance.mockReturnValue(true);

    mockSlackMessaging = {
      postToThread: vi.fn().mockResolvedValue({ ok: true }),
    };

    mockCaseData = {
      getCase: vi.fn().mockResolvedValue(mockCaseDetails),
    };

    mockSearchFacade = {
      isAzureSearchConfigured: vi.fn().mockReturnValue(true),
    };

    action = new PostAssistanceAction({
      slackMessaging: mockSlackMessaging as SlackMessagingService,
      caseData: mockCaseData as CaseDataService,
      searchFacade: mockSearchFacade as SearchFacadeService,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetPostAssistanceAction();
  });

  describe("execute", () => {
    it("should skip posting if assistance already posted", async () => {
      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: true });

      const result = await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(result).toBe(false);
      expect(mockSlackMessaging.postToThread).not.toHaveBeenCalled();
    });

    it("should post intelligent assistance for active cases", async () => {
      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      const result = await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(result).toBe(true);
      expect(mockCaseData.getCase).toHaveBeenCalledWith("SCS0001234");
      expect(mockBuildIntelligentAssistance).toHaveBeenCalled();
      expect(mockSlackMessaging.postToThread).toHaveBeenCalledWith({
        channel: "C123456",
        threadTs: "1234567890.123456",
        text: "🤖 Intelligent assistance message",
        unfurlLinks: false,
      });
    });

    it("should post minimal message for inactive cases", async () => {
      mockShouldProvideAssistance.mockReturnValue(false);

      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      const result = await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(result).toBe(true);
      expect(mockSlackMessaging.postToThread).toHaveBeenCalledWith({
        channel: "C123456",
        threadTs: "1234567890.123456",
        text: expect.stringContaining("I see you're working on"),
        unfurlLinks: false,
      });
    });

    it("should handle missing context gracefully", async () => {
      const event = createMockEvent();

      const result = await action.execute({
        event,
        caseNumber: "SCS0001234",
        context: null,
      });

      expect(result).toBe(true);
      expect(mockCaseData.getCase).toHaveBeenCalled();
    });

    it("should fetch and use channel info", async () => {
      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(mockGetChannelInfo).toHaveBeenCalledWith("C123456");
      expect(mockBuildIntelligentAssistance).toHaveBeenCalledWith(
        "SCS0001234",
        mockCaseDetails,
        expect.anything(),
        "test-channel",
        "Test topic",
        "Test purpose"
      );
    });

    it("should continue without channel info on error", async () => {
      mockGetChannelInfo.mockRejectedValue(new Error("Channel not found"));

      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      const result = await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(result).toBe(true);
      expect(mockSlackMessaging.postToThread).toHaveBeenCalled();
    });

    it("should log Azure Search status", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Azure Search ENABLED")
      );
    });

    it("should log when Azure Search is disabled", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockSearchFacade.isAzureSearchConfigured = vi.fn().mockReturnValue(false);

      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Azure Search DISABLED")
      );
    });

    it("should handle intelligent assistance build error with fallback", async () => {
      mockBuildIntelligentAssistance.mockRejectedValue(
        new Error("AI generation failed")
      );

      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      const result = await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(result).toBe(true);
      // Should post minimal fallback message
      expect(mockSlackMessaging.postToThread).toHaveBeenCalledWith({
        channel: "C123456",
        threadTs: "1234567890.123456",
        text: expect.stringContaining("I see you're working on"),
        unfurlLinks: false,
      });
    });

    it("should use event.ts as threadTs (implementation uses ts not thread_ts)", async () => {
      const event = createMockEvent({
        ts: "1234567890.999999",
        thread_ts: "1234567890.111111",
      });
      const context = createMockContext({ hasPostedAssistance: false });

      await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      // Note: Implementation uses event.ts, not event.thread_ts
      expect(mockSlackMessaging.postToThread).toHaveBeenCalledWith(
        expect.objectContaining({
          threadTs: "1234567890.999999",
        })
      );
    });

    it("should use ts as threadTs when thread_ts not present", async () => {
      mockShouldProvideAssistance.mockReturnValue(false);

      const event = createMockEvent({
        ts: "1234567890.999999",
        thread_ts: undefined,
      });
      const context = createMockContext({ hasPostedAssistance: false });

      await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(mockSlackMessaging.postToThread).toHaveBeenCalledWith(
        expect.objectContaining({
          threadTs: "1234567890.999999",
        })
      );
    });

    it("should handle null case details from ServiceNow", async () => {
      mockCaseData.getCase = vi.fn().mockResolvedValue(null);

      const event = createMockEvent();
      const context = createMockContext({ hasPostedAssistance: false });

      const result = await action.execute({
        event,
        caseNumber: "SCS0001234",
        context,
      });

      expect(result).toBe(true);
      // Should still post minimal message
      expect(mockSlackMessaging.postToThread).toHaveBeenCalled();
    });
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const mockAction = new PostAssistanceAction({
        slackMessaging: mockSlackMessaging as SlackMessagingService,
        caseData: mockCaseData as CaseDataService,
        searchFacade: mockSearchFacade as SearchFacadeService,
      });
      __setPostAssistanceAction(mockAction);

      const instance1 = getPostAssistanceAction();
      const instance2 = getPostAssistanceAction();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const mockAction1 = new PostAssistanceAction({
        slackMessaging: mockSlackMessaging as SlackMessagingService,
        caseData: mockCaseData as CaseDataService,
        searchFacade: mockSearchFacade as SearchFacadeService,
      });
      __setPostAssistanceAction(mockAction1);

      const instance1 = getPostAssistanceAction();

      __resetPostAssistanceAction();

      const mockAction2 = new PostAssistanceAction({
        slackMessaging: mockSlackMessaging as SlackMessagingService,
        caseData: mockCaseData as CaseDataService,
        searchFacade: mockSearchFacade as SearchFacadeService,
      });
      __setPostAssistanceAction(mockAction2);

      const instance2 = getPostAssistanceAction();

      expect(instance1).not.toBe(instance2);
    });

    it("should allow setting custom instance", () => {
      const customAction = new PostAssistanceAction({
        slackMessaging: mockSlackMessaging as SlackMessagingService,
        caseData: mockCaseData as CaseDataService,
        searchFacade: mockSearchFacade as SearchFacadeService,
      });
      __setPostAssistanceAction(customAction);

      const instance = getPostAssistanceAction();
      expect(instance).toBe(customAction);
    });
  });
});
