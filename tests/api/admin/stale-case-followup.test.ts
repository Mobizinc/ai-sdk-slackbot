import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "../../../api/admin/stale-case-followup/route";

const hoisted = vi.hoisted(() => ({
  authResponse: null as Response | null,
  summary: null as any,
  runResult: null as any,
  runMock: vi.fn(),
  getSummaryMock: vi.fn(),
}));

vi.mock("../../../api/admin/utils", () => ({
  authorizeAdminRequest: () => hoisted.authResponse,
  getCorsHeaders: () => ({}),
}));

vi.mock("../../../lib/services/stale-case-followup-service", () => ({
  StaleCaseFollowupService: class {
    run = (...args: any[]) => hoisted.runMock(...args);
  },
  DEFAULT_ASSIGNMENT_GROUPS: [{ assignmentGroup: "Test", slackChannel: "C123" }],
  getStaleCaseFollowupSummary: () => hoisted.getSummaryMock(),
}));

describe("admin stale case follow-up API", () => {
  beforeEach(() => {
    hoisted.authResponse = null;
    hoisted.summary = {
      runAt: new Date().toISOString(),
      thresholdDays: 3,
      followupLimit: 5,
      groups: [],
    };
    hoisted.runMock.mockReset().mockResolvedValue(hoisted.summary);
    hoisted.getSummaryMock.mockReset().mockResolvedValue(hoisted.summary);
  });

  it("returns last summary on GET", async () => {
    const response = await GET(new Request("https://example.com/api/admin/stale-case-followup"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toEqual(hoisted.summary);
  });

  it("triggers follow-up on POST", async () => {
    const response = await POST(new Request("https://example.com/api/admin/stale-case-followup", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(hoisted.runMock).toHaveBeenCalled();
    const body = await response.json();
    expect(body.summary).toEqual(hoisted.summary);
  });

  it("enforces authorization", async () => {
    hoisted.authResponse = new Response("unauthorized", { status: 401 });
    const response = await GET(new Request("https://example.com/api/admin/stale-case-followup"));
    expect(response.status).toBe(401);
  });
});
