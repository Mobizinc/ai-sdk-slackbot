import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  reviewSlackArtifact,
  reviewServiceNowArtifact,
  __resetSupervisorCaches,
} from "../lib/supervisor";

const mockConfig: Record<string, any> = {
  supervisorEnabled: true,
  supervisorShadowMode: false,
  supervisorDuplicateWindowMinutes: 5,
  supervisorAlertChannel: "",
};

const saveState = vi.fn().mockResolvedValue({ id: "state-123" });

vi.mock("../lib/config", () => ({
  getConfigValue: (key: string) => mockConfig[key],
}));

vi.mock("../lib/services/interactive-state-manager", () => ({
  getInteractiveStateManager: () => ({
    saveState,
  }),
}));

vi.mock("../lib/services/slack-messaging", () => ({
  getSlackMessagingService: () => ({
    postMessage: vi.fn(),
  }),
}));

describe("Supervisor Policy QA", () => {
  beforeEach(() => {
    __resetSupervisorCaches();
    saveState.mockClear();
    mockConfig.supervisorEnabled = true;
    mockConfig.supervisorShadowMode = false;
    mockConfig.supervisorDuplicateWindowMinutes = 5;
    mockConfig.supervisorAlertChannel = "";
  });

  it("approves artifacts when supervisor disabled", async () => {
    mockConfig.supervisorEnabled = false;
    const result = await reviewSlackArtifact({
      channelId: "C123",
      threadTs: "123.456",
      content: "hello world",
    });
    expect(result.status).toBe("approved");
  });

  it("blocks duplicate Slack messages when enforcement enabled", async () => {
    const base = {
      channelId: "C123",
      threadTs: "123.456",
      content: "duplicate message content",
    };

    const first = await reviewSlackArtifact(base);
    expect(first.status).toBe("approved");

    const second = await reviewSlackArtifact(base);
    expect(second.status).toBe("blocked");
    expect(second.reason).toContain("Duplicate Slack message");
  });

  it("requires structured sections when metadata requests it", async () => {
    const result = await reviewSlackArtifact({
      channelId: "C777",
      threadTs: "777.000",
      content: "Missing sections",
      metadata: { requiresSections: true },
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("Structured response missing required sections");
  });

  it("detects duplicate ServiceNow work notes", async () => {
    const base = {
      caseNumber: "SCS0001234",
      content: "Work note duplicate",
    };

    const first = await reviewServiceNowArtifact(base);
    expect(first.status).toBe("approved");

    const second = await reviewServiceNowArtifact(base);
    expect(second.status).toBe("blocked");
    expect(second.reason).toContain("Duplicate ServiceNow work note");
  });
});
