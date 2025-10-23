import { describe, it, expect, vi } from "vitest";

const triggerWorkflow = vi.fn();
const handleUserResponse = vi.fn();
const cleanupTimedOut = vi.fn();

vi.mock("../../lib/passive/actions/trigger-kb-workflow/start", () => ({
  triggerWorkflow: (...args: unknown[]) => triggerWorkflow(...args),
}));

vi.mock("../../lib/passive/actions/trigger-kb-workflow/gathering-response", () => ({
  handleUserResponse: (...args: unknown[]) => handleUserResponse(...args),
}));

vi.mock("../../lib/passive/actions/trigger-kb-workflow/cleanup", () => ({
  cleanupTimedOut: (...args: unknown[]) => cleanupTimedOut(...args),
}));

const { TriggerKBWorkflowAction } = require("../../lib/passive/actions/trigger-kb-workflow/main");

describe("TriggerKBWorkflowAction", () => {
  const deps = {
    slackMessaging: {} as any,
    caseData: {} as any,
    contextManager: {} as any,
  };

  it("delegates triggerWorkflow", async () => {
    const action = new TriggerKBWorkflowAction(deps);
    await action.triggerWorkflow("CASE", "CHANNEL", "THREAD");
    expect(triggerWorkflow).toHaveBeenCalledWith(deps, {
      caseNumber: "CASE",
      channelId: "CHANNEL",
      threadTs: "THREAD",
    });
  });

  it("delegates handleUserResponse", async () => {
    const action = new TriggerKBWorkflowAction(deps);
    await action.handleUserResponse({ caseNumber: "CASE", threadTs: "T", channelId: "C" } as any, "text");
    expect(handleUserResponse).toHaveBeenCalled();
  });

  it("delegates cleanupTimedOut", async () => {
    const action = new TriggerKBWorkflowAction(deps);
    await action.cleanupTimedOut();
    expect(cleanupTimedOut).toHaveBeenCalledWith(deps);
  });
});
