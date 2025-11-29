import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function createSlackMessagingMock() {
  return {
    openView: vi.fn().mockResolvedValue(undefined),
    postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456", channel: "C123" }),
  };
}

function createStateManagerMock() {
  return {
    saveState: vi.fn().mockResolvedValue(undefined),
    updatePayload: vi.fn().mockResolvedValue(true),
    markProcessed: vi.fn().mockResolvedValue(true),
    getState: vi.fn(),
  };
}

function createDemandServiceMock() {
  return {
    fetchDemandSchema: vi.fn(),
    analyzeDemandRequest: vi.fn(),
    clarifyDemandRequest: vi.fn(),
    finalizeDemandRequest: vi.fn(),
  };
}

const refs = vi.hoisted(() => ({
  slack: { mock: createSlackMessagingMock() as ReturnType<typeof createSlackMessagingMock> },
  state: { mock: createStateManagerMock() as ReturnType<typeof createStateManagerMock> },
  demand: { mock: createDemandServiceMock() as ReturnType<typeof createDemandServiceMock> },
}));

function getSlackMock() {
  return refs.slack.mock;
}
function getStateMock() {
  return refs.state.mock;
}
function getDemandMock() {
  return refs.demand.mock;
}

vi.mock("../../lib/services/slack-messaging", () => ({
  getSlackMessagingService: () => getSlackMock(),
}));

vi.mock("../../lib/services/interactive-state-manager", () => ({
  getInteractiveStateManager: () => getStateMock(),
}));

vi.mock("../../lib/services/demand-workflow-service", () => ({
  fetchDemandSchema: (...args: any[]) => getDemandMock()?.fetchDemandSchema(...args),
  analyzeDemandRequest: (...args: any[]) => getDemandMock()?.analyzeDemandRequest(...args),
  clarifyDemandRequest: (...args: any[]) => getDemandMock()?.clarifyDemandRequest(...args),
  finalizeDemandRequest: (...args: any[]) => getDemandMock()?.finalizeDemandRequest(...args),
}));

import {
  openDemandRequestModal,
  handleDemandModalSubmission,
  handleDemandThreadReply,
  DemandCallbackIds,
} from "../../lib/demand/slack-workflow";

describe("Demand Slack Workflow", () => {
  beforeEach(() => {
    Object.assign(getSlackMock(), createSlackMessagingMock());
    Object.assign(getStateMock(), createStateManagerMock());
    Object.assign(getDemandMock(), createDemandServiceMock());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("openDemandRequestModal", () => {
    it("opens modal populated with dynamic schema", async () => {
      getDemandMock()!.fetchDemandSchema.mockResolvedValue({
        servicePillars: [{ id: "cloud", name: "Cloud" }],
        technologyPartners: ["Azure"],
        targetMarkets: [{ id: "healthcare", industry: "Healthcare", priority: "high" }],
      });

      await openDemandRequestModal("TRIGGER", await getDemandMock()!.fetchDemandSchema(), {
        channelId: "C123",
        userId: "U123",
      });

      expect(getSlackMock()!.openView).toHaveBeenCalledTimes(1);
      const viewArg = getSlackMock()!.openView.mock.calls[0][0].view;
      expect(viewArg.callback_id).toBe(DemandCallbackIds.MODAL);
      expect(viewArg.blocks.length).toBeGreaterThan(0);
    });
  });

  describe("handleDemandModalSubmission", () => {
    const payload = {
      user: { id: "U123" },
      view: {
        private_metadata: JSON.stringify({
          channelId: "C123",
          userId: "U123",
        }),
        state: {
          values: {
            demand_project_name: { value: { value: "AI Assistant" } },
            demand_purpose: { value: { value: "Automate" } },
            demand_business_value: { value: { value: "Reduce MTTR" } },
            demand_expected_roi: {
              value: { selected_option: { value: "high" } },
            },
            demand_roi_details: { value: { value: "" } },
            demand_timeline: {
              value: { selected_option: { value: "1-3 months" } },
            },
            demand_resources: { value: { value: "ServiceNow engineers" } },
            demand_team_size: { value: { value: "5" } },
            demand_pillars: {
              value: { selected_options: [{ value: "cloud" }] },
            },
            demand_industry: {
              value: { selected_option: { value: "Healthcare" } },
            },
            demand_partners: {
              value: { selected_options: [{ value: "Azure" }] },
            },
            demand_delivery_opt: {
              value: { selected_options: [{ value: "true" }] },
            },
          },
        },
      },
    } as any;

    it("saves session state and posts initial analysis", async () => {
      getDemandMock()!.analyzeDemandRequest.mockResolvedValue({
        sessionId: "sess-1",
        status: "needs_clarification",
        questions: [{ id: "q1", text: "Clarify ROI" }],
        metadata: { analysis: { score: 80, issues: ["Need ROI detail"] } },
      });

      getSlackMock()!.postMessage.mockResolvedValue({
        ok: true,
        ts: "THREAD_TS",
        channel: "C123",
      });

      await handleDemandModalSubmission(payload);

      expect(getDemandMock()!.analyzeDemandRequest).toHaveBeenCalled();
      expect(getSlackMock()!.postMessage).toHaveBeenCalled();
      expect(getStateMock()!.saveState).toHaveBeenCalledWith(
        "demand_request",
        "C123",
        "THREAD_TS",
        expect.objectContaining({
          sessionId: "sess-1",
          pendingQuestions: [{ id: "q1", text: "Clarify ROI" }],
        }),
        expect.any(Object),
      );
    });
  });

  describe("handleDemandThreadReply", () => {
    const threadEvent = {
      channel: "C123",
      thread_ts: "THREAD_TS",
      user: "U123",
      text: "Here is more detail",
    } as any;

    it("sends clarification answer and posts next question", async () => {
      getStateMock()!.getState.mockResolvedValue({
        payload: {
          sessionId: "sess-1",
          userId: "U123",
          pendingQuestions: [{ id: "q1", text: "Clarify ROI" }],
          demandRequest: { projectName: "AI Assistant" },
          status: "needs_clarification",
        },
      });

      getDemandMock()!.clarifyDemandRequest.mockResolvedValue({
        sessionId: "sess-1",
        status: "needs_clarification",
        questions: [{ id: "q2", text: "Timeline detail?" }],
        response: "Thanks for clarifying ROI.",
      });

      const handled = await handleDemandThreadReply(threadEvent);

      expect(handled).toBe(true);
      expect(getDemandMock()!.clarifyDemandRequest).toHaveBeenCalledWith({
        sessionId: "sess-1",
        questionId: "q1",
        answer: "Here is more detail",
      });
      expect(getSlackMock()!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadTs: "THREAD_TS",
        }),
      );
      expect(getStateMock()!.updatePayload).toHaveBeenCalled();
    });

    it("finalizes when clarification completes", async () => {
      getStateMock()!.getState.mockResolvedValue({
        payload: {
          sessionId: "sess-1",
          userId: "U123",
          pendingQuestions: [{ id: "q1", text: "Clarify ROI" }],
          demandRequest: { projectName: "AI Assistant" },
          status: "needs_clarification",
        },
      });

      getDemandMock()!.clarifyDemandRequest.mockResolvedValue({
        sessionId: "sess-1",
        status: "complete",
        questions: [],
        response: "All set!",
      });

      getDemandMock()!.finalizeDemandRequest.mockResolvedValue({
        sessionId: "sess-1",
        status: "complete",
        summary: {
          executiveSummary: "Great project.",
          keyMetrics: ["ROI 150%"],
          risksAndAssumptions: [],
        },
      });

      const handled = await handleDemandThreadReply(threadEvent);

      expect(handled).toBe(true);
      expect(getDemandMock()!.finalizeDemandRequest).toHaveBeenCalledWith("sess-1");
      expect(getSlackMock()!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadTs: "THREAD_TS",
          text: "Demand request completed.",
        }),
      );
    });
  });
});
