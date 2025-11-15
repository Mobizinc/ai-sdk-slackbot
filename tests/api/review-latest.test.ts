import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../../api/commands/review-latest";
import { verifyRequest } from "../../lib/slack-utils";
import type { SupervisorReviewStatePayload } from "../../lib/services/interactive-state-manager";

const hoisted = vi.hoisted(() => ({
  stateManager: {
    getPendingStatesByType: vi.fn(),
    getStateById: vi.fn(),
    markProcessed: vi.fn(),
  },
  actions: {
    approveSupervisorState: vi.fn(async (stateId: string) => buildState({ id: stateId })),
    rejectSupervisorState: vi.fn(async (stateId: string) => buildState({ id: stateId })),
  },
}));

const getMockStateManager = () => hoisted.stateManager;

vi.mock("../../lib/slack-utils", () => ({
  verifyRequest: vi.fn(),
}));

vi.mock("../../lib/services/interactive-state-manager", () => ({
  getInteractiveStateManager: () => hoisted.stateManager,
}));

vi.mock("../../lib/services/slack-messaging", () => ({
  getSlackMessagingService: () => ({
    postToThread: vi.fn(),
  }),
}));

vi.mock("../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    isConfigured: () => false,
  },
}));

vi.mock("../../lib/supervisor/actions", () => ({
  approveSupervisorState: (stateId: string, reviewer: string) =>
    hoisted.actions.approveSupervisorState(stateId, reviewer),
  rejectSupervisorState: (stateId: string, reviewer: string) =>
    hoisted.actions.rejectSupervisorState(stateId, reviewer),
  SupervisorStateNotFoundError: class SupervisorStateNotFoundError extends Error {},
}));

interface MockState {
  id: string;
  type: "supervisor_review";
  channelId: string;
  messageTs: string;
  payload: SupervisorReviewStatePayload;
}

const buildPayload = (): SupervisorReviewStatePayload => ({
  artifactType: "slack_message",
  caseNumber: "SCS0001",
  content: "blocked content",
  reason: "Low confidence",
  blockedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  llmReview: {
    verdict: "revise",
    summary: "Clarify next steps",
    issues: [
      {
        severity: "medium",
        description: "Add remediation steps",
        recommendation: "List 2 concrete actions",
      },
    ],
    confidence: 0.7,
  },
});

const buildState = (overrides: Partial<MockState> = {}): MockState => {
  const basePayload = buildPayload();

  return {
    id: "state-1",
    type: "supervisor_review",
    channelId: "C1",
    messageTs: "123",
    payload: {
      ...basePayload,
      ...(overrides.payload ?? {}),
    },
    ...overrides,
  };
};

const createRequest = (text: string) =>
  new Request("https://example.com/api/commands/review-latest", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text, user_id: "U123" }),
  });

describe("/review-latest command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const manager = getMockStateManager();
    manager.getPendingStatesByType.mockReset().mockResolvedValue([]);
    manager.getStateById.mockReset();
    manager.markProcessed.mockReset();
    vi.mocked(verifyRequest).mockResolvedValue(undefined as any);
  });

  it("filters Slack artifacts and shows verdict summary", async () => {
    const manager = getMockStateManager();
    manager.getPendingStatesByType.mockResolvedValue([
      buildState({ id: "state-slack", payload: { ...buildPayload(), channelId: "C123", threadTs: "456" } }),
      buildState({
        id: "state-sn",
        payload: {
          ...buildPayload(),
          artifactType: "servicenow_work_note",
          llmReview: { verdict: "critical", summary: "Policy risk", issues: [], confidence: 0.9 },
        },
      }),
    ]);

    const response = await POST(createRequest("list slack"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.text).toContain("state-slack");
    expect(body.text).not.toContain("state-sn");
    expect(body.text).toContain("Verdict: REVISE (70%)");
    expect(body.text).toContain("LLM: Clarify next steps");
    expect(body.text).toContain("1. [medium] Add remediation steps — List 2 concrete actions");
  });

  it("applies min age filter", async () => {
    const manager = getMockStateManager();
    manager.getPendingStatesByType.mockResolvedValue([
      buildState({ id: "young", payload: { ...buildPayload(), blockedAt: new Date().toISOString() } }),
    ]);

    const response = await POST(createRequest("list slack 60"));
    const body = await response.json();

    expect(body.text).toContain("No artifacts match Slack");
  });

  it("supports verdict and limit filters with key-value syntax", async () => {
    const manager = getMockStateManager();
    manager.getPendingStatesByType.mockResolvedValue([
      buildState({ id: "revise-1" }),
      buildState({ id: "revise-2", payload: { ...buildPayload(), blockedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() } }),
      buildState({
        id: "pass-1",
        payload: {
          ...buildPayload(),
          llmReview: { verdict: "pass", summary: "Looks good", issues: [], confidence: 0.95 },
        },
      }),
    ]);

    const response = await POST(createRequest("list type=slack verdict=revise limit=1"));
    const body = await response.json();

    expect(body.text).toContain("Filters: Slack | verdict=revise | limit=1");
    expect((body.text.match(/revise-/g) || []).length).toBe(1);
    expect(body.text).not.toContain("pass-1");
  });
});
