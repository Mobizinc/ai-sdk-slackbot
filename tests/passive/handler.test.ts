import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GenericMessageEvent } from "../../lib/slack-event-types";

const shouldSkipMessage = vi.fn();
const isDelegationMessage = vi.fn();
const processCaseDetection = vi.fn();
const processExistingThread = vi.fn();

vi.mock("../../lib/passive/handler-utils", () => ({
  shouldSkipMessage: (...args: unknown[]) => shouldSkipMessage(...args),
  isDelegationMessage: (...args: unknown[]) => isDelegationMessage(...args),
  processCaseDetection: (...args: unknown[]) => processCaseDetection(...args),
  processExistingThread: (...args: unknown[]) => processExistingThread(...args),
}));

import { handlePassiveMessage } from "../../lib/passive/handler";

function buildEvent(partial: Partial<GenericMessageEvent>): GenericMessageEvent {
  return {
    type: "message",
    channel: "C123",
    event_ts: "123",
    ts: "123",
    text: "Resolved case SCS0001234",
    user: "U123",
    ...partial,
  } as GenericMessageEvent;
}

describe("passive handler", () => {
  beforeEach(() => {
    shouldSkipMessage.mockReset().mockReturnValue(false);
    isDelegationMessage.mockReset().mockReturnValue(false);
    processCaseDetection.mockReset();
    processExistingThread.mockReset();
  });

  it("skips processing when shouldSkipMessage returns true", async () => {
    shouldSkipMessage.mockReturnValue(true);

    await handlePassiveMessage(buildEvent({}), "BOT");

    expect(processCaseDetection).not.toHaveBeenCalled();
    expect(processExistingThread).not.toHaveBeenCalled();
  });

  it("skips processing when isDelegationMessage returns true", async () => {
    isDelegationMessage.mockReturnValue(true);

    await handlePassiveMessage(buildEvent({ text: "Hello <@U123>, please take a look at SCS0001111" }), "BOT");

    expect(processCaseDetection).not.toHaveBeenCalled();
    expect(processExistingThread).not.toHaveBeenCalled();
  });

  it("processes each detected case", async () => {
    await handlePassiveMessage(buildEvent({ text: "SCS0001111 SCS0002222" }), "BOT");

    expect(processCaseDetection).toHaveBeenCalledTimes(2);
    expect(processCaseDetection).toHaveBeenNthCalledWith(1, expect.any(Object), "SCS0001111");
    expect(processCaseDetection).toHaveBeenNthCalledWith(2, expect.any(Object), "SCS0002222");
  });

  it("processes existing thread when thread_ts present", async () => {
    await handlePassiveMessage(buildEvent({ thread_ts: "999" }), "BOT");

    expect(processExistingThread).toHaveBeenCalledTimes(1);
  });
});
