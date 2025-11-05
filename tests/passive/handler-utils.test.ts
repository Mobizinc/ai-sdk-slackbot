import { describe, it, expect, vi, beforeEach } from "vitest";

const addMessageFromEvent = vi.fn();
const getContext = vi.fn();
const updateChannelInfo = vi.fn();
const markAssistancePosted = vi.fn();
const findContextsForThread = vi.fn();
const resetResolutionFlag = vi.fn();
const markResolutionNotified = vi.fn();

const executeAssistance = vi.fn();
const shouldTriggerKBWorkflow = vi.fn();
const handleUserResponse = vi.fn();
const triggerWorkflow = vi.fn();
const getContextsInThread = vi.fn();

vi.mock("../../lib/passive/actions/add-to-context", () => ({
  getAddToContextAction: () => ({
    addMessageFromEvent,
    getContext,
    updateChannelInfo,
    markAssistancePosted,
    findContextsForThread,
    resetResolutionFlag,
    markResolutionNotified,
  }),
}));

vi.mock("../../lib/passive/actions/post-assistance", () => ({
  getPostAssistanceAction: () => ({
    execute: executeAssistance,
  }),
}));

vi.mock("../../lib/passive/actions/trigger-kb-workflow", () => ({
  getTriggerKBWorkflowAction: () => ({
    triggerWorkflow,
    handleUserResponse,
  }),
}));

vi.mock("../../lib/passive/detectors/resolution-detector", () => ({
  getResolutionDetector: () => ({ shouldTriggerKBWorkflow }),
}));

const isWaitingForUser = vi.fn();
vi.mock("../../lib/services/kb-state-machine", () => ({
  getKBStateMachine: () => ({
    isWaitingForUser,
  }),
}));

const getChannelInfo = vi.fn();
vi.mock("../../lib/services/channel-info", () => ({
  getChannelInfo: (...args: unknown[]) => getChannelInfo(...args),
}));

import * as utils from "../../lib/passive/handler-utils";

const baseEvent = {
  type: "message",
  channel: "C123",
  event_ts: "111",
  ts: "111",
  text: "Case SCS0001111 resolved",
  user: "U001",
};

describe("handler utils", () => {
  beforeEach(() => {
    addMessageFromEvent.mockReset();
    getContext.mockReset();
    updateChannelInfo.mockReset();
    markAssistancePosted.mockReset();
    executeAssistance.mockReset();
    findContextsForThread.mockReset();
    resetResolutionFlag.mockReset();
    markResolutionNotified.mockReset();
    shouldTriggerKBWorkflow.mockReset();
    triggerWorkflow.mockReset();
    handleUserResponse.mockReset();
    isWaitingForUser.mockReset();
    getChannelInfo.mockReset();
  });

  it("evaluates shouldSkipMessage conditions", () => {
    expect(utils.shouldSkipMessage({ ...baseEvent, bot_id: "B" }, "BOT")).toBe(true);
    expect(utils.shouldSkipMessage({ ...baseEvent, text: "" }, "BOT")).toBe(true);
    expect(utils.shouldSkipMessage({ ...baseEvent, text: `<@BOT> hi` }, "BOT")).toBe(true);
    expect(utils.shouldSkipMessage(baseEvent, "BOT")).toBe(false);
  });

  describe("isDelegationMessage", () => {
    it("detects delegation when user mentions someone and uses delegation phrases", () => {
      const delegationEvent = {
        ...baseEvent,
        text: "Hello <@U022JVDPVCJ>, please take a look at the cases [SCS0050219]",
      };
      expect(utils.isDelegationMessage(delegationEvent)).toBe(true);
    });

    it("detects 'can you review' delegation", () => {
      const delegationEvent = {
        ...baseEvent,
        text: "<@U123456> can you review SCS0001234?",
      };
      expect(utils.isDelegationMessage(delegationEvent)).toBe(true);
    });

    it("detects 'please check' delegation", () => {
      const delegationEvent = {
        ...baseEvent,
        text: "Hey <@U123456>, please check SCS0001234",
      };
      expect(utils.isDelegationMessage(delegationEvent)).toBe(true);
    });

    it("does not detect delegation without mention", () => {
      const workEvent = {
        ...baseEvent,
        text: "I'm working on SCS0001234, please take a look at the logs",
      };
      expect(utils.isDelegationMessage(workEvent)).toBe(false);
    });

    it("does not detect delegation without delegation phrases", () => {
      const workEvent = {
        ...baseEvent,
        text: "<@U123456> I fixed SCS0001234",
      };
      expect(utils.isDelegationMessage(workEvent)).toBe(false);
    });

    it("detects various delegation phrases with mentions", () => {
      const phrases = [
        "please review",
        "can you check",
        "take a look at",
        "could you review",
        "please handle",
        "assigning",
      ];

      phrases.forEach(phrase => {
        const event = {
          ...baseEvent,
          text: `<@U123456> ${phrase} SCS0001234`,
        };
        expect(utils.isDelegationMessage(event)).toBe(true);
      });
    });
  });

  it("processCaseDetection posts assistance when context is new", async () => {
    getContext.mockReturnValue({ hasPostedAssistance: false });
    executeAssistance.mockResolvedValue(true);
    getChannelInfo.mockResolvedValue({ channelName: "test" });

    await utils.processCaseDetection(baseEvent, "SCS0001111");

    expect(addMessageFromEvent).toHaveBeenCalled();
    expect(updateChannelInfo).toHaveBeenCalled();
    expect(markAssistancePosted).toHaveBeenCalled();
  });

  it("processExistingThread triggers KB when resolution detected", async () => {
    findContextsForThread.mockReturnValue([
      {
        caseNumber: "SCS1",
        threadTs: "t1",
        channelId: "C123",
        isResolved: true,
      },
    ]);
    shouldTriggerKBWorkflow.mockReturnValue({ isResolved: true, reason: "Resolved" });

    await utils.processExistingThread({ ...baseEvent, thread_ts: "t1" });

    expect(triggerWorkflow).toHaveBeenCalledWith("SCS1", "C123", "t1");
  });
});
