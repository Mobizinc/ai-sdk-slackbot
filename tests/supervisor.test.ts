import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  reviewSlackArtifact,
  reviewServiceNowArtifact,
  __resetSupervisorCaches,
} from "../lib/supervisor";
import type { SupervisorLlmReview } from "../lib/supervisor/llm-reviewer";

const mockConfig: Record<string, any> = {
  supervisorEnabled: true,
  supervisorShadowMode: false,
  supervisorDuplicateWindowMinutes: 5,
  supervisorAlertChannel: "",
  supervisorLlmReviewModel: "test-model",
};

const saveState = vi.fn().mockResolvedValue({ id: "state-123" });
const mockRunLlmReview = vi.fn().mockResolvedValue(null as SupervisorLlmReview | null);

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

vi.mock("../lib/supervisor/llm-reviewer", () => ({
  runSupervisorLlmReview: (...args: any[]) => mockRunLlmReview(...args),
}));

describe("Supervisor Policy QA", () => {
  beforeEach(() => {
    __resetSupervisorCaches();
    saveState.mockClear();
    mockRunLlmReview.mockClear();
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

  it("approves triage response with properly formatted sections", async () => {
    const triageResponse = `*Triage Results for SCS0050980*

*Summary*
Case SCS0050980 has been triaged as Software > Application Issue with 85% confidence.

*Current State*
*Classification:* Software > Application Issue
*Confidence:* 85%
*Urgency Level:* High

*Immediate Next Steps:*
1. Check application logs
2. Contact the vendor

_Processing time: 1234ms_`;

    const result = await reviewSlackArtifact({
      channelId: "C888",
      threadTs: "888.000",
      caseNumber: "SCS0050980",
      content: triageResponse,
      metadata: {
        requiresSections: true,
        artifactLabel: "triage_response"
      },
    });

    expect(result.status).toBe("approved");
  });

  it("approves general queries without section requirements", async () => {
    const generalResponse = `Case SCS0050980 is currently in progress. The assignee is working on resolving the application issue. Expected resolution time is within 24 hours.`;

    const result = await reviewSlackArtifact({
      channelId: "C999",
      threadTs: "999.000",
      caseNumber: "SCS0050980",
      content: generalResponse,
      metadata: {
        requiresSections: false, // General queries don't require sections
        artifactLabel: "general_response"
      },
    });

    expect(result.status).toBe("approved");
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

  it("attaches llm review metadata when enabled", async () => {
    mockConfig.supervisorLlmReviewEnabled = true;
    mockRunLlmReview.mockResolvedValueOnce({
      verdict: "revise",
      summary: "Clarify the resolution steps",
      issues: [
        { severity: "medium", description: "Missing Summary", recommendation: "Add Summary" },
      ],
      confidence: 0.82,
    });

    const result = await reviewSlackArtifact({
      channelId: "C999",
      threadTs: "999.1",
      content: "Missing sections",
      metadata: { requiresSections: true },
    });

    expect(result.llmReview?.summary).toContain("Clarify");
    const payloadArg = saveState.mock.calls[0]?.[3];
    expect(payloadArg.llmReview?.verdict).toBe("revise");
  });
});
