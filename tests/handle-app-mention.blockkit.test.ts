import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const mockSlackClient = {
    chat: {
      postMessage: vi.fn().mockResolvedValue({
        ok: true,
        ts: "1762615640.062949",
        channel: "C027ZM8M0KE",
      }),
      update: vi.fn().mockResolvedValue({
        ok: true,
        channel: "C027ZM8M0KE",
        ts: "1762615640.062949",
        message: {
          text: "",
          blocks: [],
        },
      }),
    },
  };

  return {
    mockSlackClient,
    generateResponseMock: vi.fn(),
    contextManager: {
      extractCaseNumbers: vi.fn().mockReturnValue(["SCS0048475"]),
      addMessage: vi.fn(),
      getContextSync: vi.fn().mockReturnValue({ isResolved: false, _notified: false }),
    },
  };
});

vi.mock("../lib/services/slack-messaging", async () => {
  const actual = await vi.importActual<any>("../lib/services/slack-messaging");
  const service = new actual.SlackMessagingService(mocks.mockSlackClient);
  return {
    ...actual,
    getSlackMessagingService: () => service,
  };
});

vi.mock("../lib/agent", () => ({
  generateResponse: (...args: unknown[]) => mocks.generateResponseMock(...args),
}));

vi.mock("../lib/context-manager", () => ({
  getContextManager: () => mocks.contextManager,
}));

vi.mock("../lib/handle-passive-messages", () => ({
  notifyResolution: vi.fn(),
}));

vi.mock("../lib/config/helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/config/helpers")>();
  return {
    ...actual,
    isServiceNowConfigured: vi.fn().mockReturnValue(false),
  };
});

vi.mock("../lib/infrastructure/servicenow/repositories", () => ({
  getCaseRepository: vi.fn().mockReturnValue({
    findByNumber: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock("../lib/services/case-triage", () => ({
  getCaseTriageService: vi.fn(),
}));

import { handleNewAppMention } from "../lib/handle-app-mention";

describe("handleNewAppMention Block Kit formatting", () => {
  beforeEach(() => {
    mocks.generateResponseMock.mockReset();
    mocks.contextManager.extractCaseNumbers.mockClear();
    mocks.contextManager.addMessage.mockClear();
    mocks.contextManager.getContextSync.mockClear();
    mocks.mockSlackClient.chat.postMessage.mockClear();
    mocks.mockSlackClient.chat.update.mockClear();
  });

  it("splits long LLM summaries into section blocks before appending the minimal case card", async () => {
    const longSummary = Array(6000)
      .fill("SCS0048475 is a NetScaler upgrade project for North Oaks Hospital - currently pending CAB approval.")
      .join(" ");

    const blockKitPayload = {
      text: JSON.stringify({ text: longSummary }),
      _blockKitData: {
        type: "case_detail",
        caseData: {
          number: "SCS0048475",
          short_description: "NetScaler upgrade project",
          priority: "4 - Low",
          state: "Open",
          sys_id: "af268598c3ec3210ad36b9ff0501311c",
        },
      },
    };

    mocks.generateResponseMock.mockResolvedValue(JSON.stringify(blockKitPayload));

    await handleNewAppMention(
      {
        type: "app_mention",
        channel: "C027ZM8M0KE",
        text: "<@U09MK0EAZEK> provide me details for SCS0048475",
        ts: "1762615640.062949",
        user: "U111",
      } as any,
        "U09MK0EAZEK",
    );

    const updateCalls = mocks.mockSlackClient.chat.update.mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);

    const finalCallArgs = updateCalls[updateCalls.length - 1][0];

    expect(finalCallArgs.blocks).toBeDefined();
    const finalBlocks = finalCallArgs.blocks ?? [];

    // Expect first block to be section populated with the LLM summary (not just the minimal card)
    expect(finalBlocks[0]?.type).toBe("section");
    expect(finalBlocks[0]?.text?.text).toContain("NetScaler upgrade project");

    // Ensure case card (actions block) is still appended
    expect(finalBlocks.some((block: any) => block.type === "actions")).toBe(true);

    // Slack fallback text is clamped so it never exceeds the display limit
    expect(finalCallArgs.text.length).toBeLessThanOrEqual(12000);
    expect(finalBlocks.length).toBeGreaterThan(2);
  });
});
