import { beforeEach, describe, expect, it, vi } from "vitest";

const tasks: Promise<unknown>[] = [];

const mocks = vi.hoisted(() => ({
  postMessage: vi.fn(),
  openConversation: vi.fn(),
  getProjectCatalog: vi.fn(),
  getStandupConfig: vi.fn(),
  triggerStandupManually: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("../../lib/background-tasks", () => ({
  enqueueBackgroundTask: (task: Promise<unknown>) => {
    tasks.push(task);
  },
}));

vi.mock("../../lib/services/slack-messaging", () => ({
  getSlackMessagingService: () => ({
    postMessage: mocks.postMessage,
    openConversation: mocks.openConversation,
  }),
  SlackMessagingService: class {},
}));

vi.mock("../../lib/projects/catalog", () => ({
  getProjectCatalog: mocks.getProjectCatalog,
}));

vi.mock("../../lib/projects/standup-service", () => ({
  getStandupConfig: mocks.getStandupConfig,
  triggerStandupManually: mocks.triggerStandupManually,
}));

vi.mock("../../lib/db/client", () => ({
  getDb: mocks.getDb,
}));

vi.mock("../../lib/db/schema", () => ({
  projectStandups: {
    id: "id",
    projectId: "project_id",
    createdAt: "created_at",
  },
}));

import { emitStrategicEvaluationCompleted } from "../../lib/strategy/events";
import "../../lib/strategy/event-subscribers";

describe("strategic evaluation subscribers", () => {
  beforeEach(() => {
    tasks.length = 0;
    mocks.postMessage.mockReset();
    mocks.openConversation.mockReset();
    mocks.getProjectCatalog.mockReset();
    mocks.getStandupConfig.mockReset();
    mocks.triggerStandupManually.mockReset();
    mocks.getDb.mockReset();

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mocks.getDb.mockReturnValue({
      select: selectMock,
    });

    mocks.getProjectCatalog.mockResolvedValue([
      {
        id: "ai-sdk-slackbot",
        name: "AI SDK Slackbot",
        status: "active",
        summary: "Build an AI-assisted Slack bot",
        channelId: "C-Project",
      },
    ]);

    mocks.getStandupConfig.mockReturnValue({
      enabled: true,
      channelId: "C-Project",
      schedule: {
        frequency: "weekly",
        timeUtc: "14:30",
        dayOfWeek: 1,
      },
      participants: ["U456"],
      includeMentor: true,
      includeAcceptedCandidates: true,
      questions: [],
      collectionWindowMinutes: 90,
      reminderMinutesBeforeDue: 45,
      maxReminders: 2,
    });

    mocks.triggerStandupManually.mockResolvedValue({
      standup: {
        id: "standup-123",
      },
      participants: ["U123", "U456"],
    });

    mocks.openConversation.mockResolvedValue({ channelId: "D-user" });
    mocks.postMessage.mockResolvedValue({ ok: true });
  });

  it("DMs requester, posts to project channel, and triggers stand-up scheduling", async () => {
    emitStrategicEvaluationCompleted({
      evaluationId: "eval-1",
      projectName: "AI SDK Slackbot",
      requestedBy: "U-requester",
      requestedByName: "Requester",
      channelId: "C-Project",
      score: 88,
      recommendation: "proceed",
      confidence: "high",
      needsClarification: false,
      createdAt: new Date().toISOString(),
      demandRequest: {
        projectName: "AI SDK Slackbot",
        purpose: "Automate triage",
        businessValue: "Reduce MTTR",
        expectedROI: "180%",
        timeline: "Q3",
        resourcesNeeded: "Engineers & PM",
        teamSize: 4,
        strategicAlignment: ["cloud-infrastructure"],
        targetIndustry: "Enterprise",
        partnerTechnologies: ["ServiceNow"],
      },
      analysis: {
        issues: [],
        questions: ["How will we measure success?"],
        score: 90,
        needsClarification: true,
        servicePillars: ["cloud-infrastructure"],
      },
      summary: {
        executiveSummary: "Great fit for Mobizinc strategy.",
        keyMetrics: ["MTTR reduction", "Automation rate"],
        risksAndAssumptions: [],
        completenessScore: 90,
        nextSteps: ["Schedule kickoff meeting"],
        strategicScoring: {
          criteriaScores: [
            {
              criterionId: "strategic-fit",
              criterionName: "Strategic Fit",
              score: 9,
              weight: 25,
              weightedScore: 22.5,
              reasoning: "Strong alignment with pillars.",
            },
          ],
          totalScore: 90,
          rating: "priority",
          recommendation: "proceed",
          confidence: "high",
        },
      },
    });

    await Promise.all(tasks);

    expect(mocks.openConversation).toHaveBeenCalledWith("U-requester");

    const dmCall = mocks.postMessage.mock.calls.find(
      ([args]) => args.channel === "D-user",
    );
    const channelCall = mocks.postMessage.mock.calls.find(
      ([args]) => args.channel === "C-Project",
    );

    expect(dmCall).toBeTruthy();
    expect(channelCall).toBeTruthy();

    expect(mocks.triggerStandupManually).toHaveBeenCalled();
  });
});
