import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "../../../api/admin/supervisor-reviews/route";
import type { SupervisorReviewStatePayload } from "../../../lib/services/interactive-state-manager";

const hoisted = vi.hoisted(() => ({
  authResponse: null as Response | null,
  manager: {
    getPendingStatesByType: vi.fn(),
  },
  actions: {
    approveSupervisorState: vi.fn(),
    rejectSupervisorState: vi.fn(),
  },
}));

const samplePayload = (): SupervisorReviewStatePayload => ({
  artifactType: "slack_message",
  caseNumber: "SCS1001",
  content: "blocked",
  reason: "Low confidence",
  blockedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  llmReview: {
    verdict: "revise",
    summary: "Clarify remediation steps",
    issues: [],
    confidence: 0.6,
  },
});

const buildState = (override?: Partial<any>) => ({
  id: "state-1",
  type: "supervisor_review",
  status: "pending",
  channelId: "C123",
  messageTs: "123.456",
  payload: samplePayload(),
  ...override,
});

vi.mock("../../../api/admin/utils", () => ({
  authorizeAdminRequest: () => hoisted.authResponse,
  getCorsHeaders: () => ({}),
}));

vi.mock("../../../lib/services/interactive-state-manager", () => ({
  getInteractiveStateManager: () => hoisted.manager,
}));

vi.mock("../../../lib/supervisor/actions", () => ({
  approveSupervisorState: (...args: any[]) => hoisted.actions.approveSupervisorState(...args),
  rejectSupervisorState: (...args: any[]) => hoisted.actions.rejectSupervisorState(...args),
  SupervisorStateNotFoundError: class SupervisorStateNotFoundError extends Error {},
}));

describe("admin supervisor reviews API", () => {
  beforeEach(() => {
    hoisted.authResponse = null;
    hoisted.manager.getPendingStatesByType.mockReset().mockResolvedValue([
      buildState(),
      buildState({
        id: "state-2",
        payload: {
          ...samplePayload(),
          artifactType: "servicenow_work_note",
          llmReview: { verdict: "critical", summary: "Compliance risk", issues: [], confidence: 0.9 },
        },
      }),
    ]);
    hoisted.actions.approveSupervisorState.mockReset().mockResolvedValue(buildState());
    hoisted.actions.rejectSupervisorState.mockReset().mockResolvedValue(buildState());
  });

  it("returns filtered reviews", async () => {
    const response = await GET(
      new Request("https://example.com/api/admin/supervisor-reviews?type=slack")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.filters.type).toBe("slack");
    expect(body.items[0].verdict).toBe("revise");
  });

  it("enforces authorization", async () => {
    hoisted.authResponse = new Response("unauthorized", { status: 401 });
    const response = await GET(new Request("https://example.com/api/admin/supervisor-reviews"));
    expect(response.status).toBe(401);
  });

  it("approves a supervisor state", async () => {
    const req = new Request("https://example.com/api/admin/supervisor-reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve", stateId: "state-1", reviewer: "tester" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(hoisted.actions.approveSupervisorState).toHaveBeenCalledWith("state-1", "tester");
  });
});
