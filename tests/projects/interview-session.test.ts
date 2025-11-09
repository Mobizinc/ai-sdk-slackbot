import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postMessageMock: vi.fn(),
  openConversationMock: vi.fn(),
  saveStateMock: vi.fn(),
  getStateByChannelMock: vi.fn(),
  updatePayloadMock: vi.fn(),
  markProcessedMock: vi.fn(),
  emitProjectInterviewCompleted: vi.fn(),
  generateInterviewQuestions: vi.fn(async () => [
    { id: "generated_typescript", prompt: "Tell us about your TypeScript experience." },
    { id: "generated_async", prompt: "Share a time you handled async workflows." },
    { id: "generated_learning", prompt: "What do you want to learn on this project?" },
  ]),
  findInterestMock: vi.fn(),
  createInterestMock: vi.fn(),
  updateInterestStatusMock: vi.fn(),
  getActiveInterestCountMock: vi.fn(),
  checkCapacityMock: vi.fn(),
}));

vi.mock("../../lib/db/client", () => ({
  getDb: vi.fn(() => null),
}));

vi.mock("../../lib/services/slack-messaging", () => ({
  getSlackMessagingService: vi.fn(() => ({
    postMessage: mocks.postMessageMock,
    openConversation: mocks.openConversationMock,
  })),
  SlackMessagingService: class {},
}));

vi.mock("../../lib/services/interactive-state-manager", () => ({
  getInteractiveStateManager: vi.fn(() => ({
    saveState: mocks.saveStateMock,
    getStateByChannel: mocks.getStateByChannelMock,
    updatePayload: mocks.updatePayloadMock,
    markProcessed: mocks.markProcessedMock,
  })),
}));

vi.mock("../../lib/projects/catalog", () => ({
  getProjectById: vi.fn(async () => ({
    id: "ai-sdk-slackbot-001",
    name: "AI SDK Slackbot",
    status: "active",
    summary: "Build an AI-powered Slack bot.",
    mentor: { slackUserId: "Umentor", name: "Mentor" },
  })),
}));

vi.mock("../../lib/projects/matching-service", () => ({
  scoreInterviewAgainstProject: vi.fn(async () => ({
    score: 85,
    summary: "Strong alignment with project goals.",
    recommendedTasks: ["Help triage backlog issues"],
  })),
}));

vi.mock("../../lib/projects/interview-events", () => ({
  emitProjectInterviewCompleted: mocks.emitProjectInterviewCompleted,
}));

vi.mock("../../lib/projects/question-generator", () => ({
  generateInterviewQuestions: mocks.generateInterviewQuestions,
}));

vi.mock("../../lib/db/repositories/interest-repository", () => ({
  findInterest: mocks.findInterestMock,
  createInterest: mocks.createInterestMock,
  updateInterestStatus: mocks.updateInterestStatusMock,
  getActiveInterestCount: mocks.getActiveInterestCountMock,
}));

vi.mock("../../lib/projects/capacity", () => ({
  checkCapacity: mocks.checkCapacityMock,
}));

import { startInterviewSession, handleInterviewResponse } from "../../lib/projects/interview-session";

const sampleProject = {
  id: "ai-sdk-slackbot-001",
  name: "AI SDK Slackbot",
  status: "active" as const,
  summary: "Build an AI-powered Slack bot.",
  mentor: { slackUserId: "Umentor", name: "Mentor" },
  interview: {
    generator: {
      model: "claude-3-haiku-20240307",
      questionCount: 3,
    },
    questions: [],
  },
};

describe("project interview session", () => {
  const {
    postMessageMock,
    openConversationMock,
    saveStateMock,
    getStateByChannelMock,
    updatePayloadMock,
    markProcessedMock,
    emitProjectInterviewCompleted,
    generateInterviewQuestions,
    findInterestMock,
    createInterestMock,
    updateInterestStatusMock,
    checkCapacityMock,
  } = mocks;

  beforeEach(() => {
    postMessageMock.mockReset();
    openConversationMock.mockReset();
    saveStateMock.mockReset();
    getStateByChannelMock.mockReset();
    updatePayloadMock.mockReset();
    markProcessedMock.mockReset();
    emitProjectInterviewCompleted.mockReset();
    generateInterviewQuestions.mockClear();
    findInterestMock.mockReset();
    createInterestMock.mockReset();
    updateInterestStatusMock.mockReset();
    checkCapacityMock.mockReset();

    // Default mocks
    findInterestMock.mockResolvedValue(null); // No existing interest
    createInterestMock.mockResolvedValue({ id: "interest-123", status: "pending" });
    updateInterestStatusMock.mockResolvedValue({ id: "interest-123" });
    checkCapacityMock.mockResolvedValue(true); // Has capacity
  });

  it("starts an interview session when no active session exists", async () => {
    openConversationMock.mockResolvedValue({ channelId: "D123" });
    postMessageMock.mockResolvedValue({ ok: true, ts: "111" });
    getStateByChannelMock.mockResolvedValue(null);

    await startInterviewSession({
      project: sampleProject,
      userId: "U123",
      userName: "Interested User",
      initiatedBy: "U123",
    });

    expect(openConversationMock).toHaveBeenCalledWith("U123");
    expect(generateInterviewQuestions).toHaveBeenCalled();
    expect(postMessageMock).toHaveBeenCalled();
    expect(saveStateMock).toHaveBeenCalledWith(
      "project_interview",
      "D123",
      "111",
      expect.objectContaining({
        projectId: sampleProject.id,
        userId: "U123",
        questions: expect.any(Array),
        questionSource: "generator",
        generatorModel: "claude-3-haiku-20240307",
      }),
      expect.any(Object),
    );
  });

  it("handles interview responses and queues next question", async () => {
    postMessageMock.mockResolvedValue({ ok: true, ts: "222" });
    getStateByChannelMock.mockResolvedValue({
      channelId: "D123",
      messageTs: "111",
      payload: {
        projectId: sampleProject.id,
        userId: "U123",
        mentorId: "Umentor",
        currentStep: 0,
        answers: [],
        questions: [
          {
            id: "experience_typescript",
            prompt: "Have you worked with TypeScript before?",
          },
          {
            id: "async_patterns",
            prompt: "Share a time you debugged async logic.",
          },
        ],
        questionSource: "config",
        startedAt: new Date().toISOString(),
      },
    });

    const handled = await handleInterviewResponse({
      type: "message",
      user: "U123",
      channel: "D123",
      text: "I have experience with TypeScript.",
      ts: "200",
    } as any);

    expect(handled).toBe(true);
    expect(updatePayloadMock).toHaveBeenCalled();
    expect(postMessageMock).toHaveBeenCalled();
  });

  it("blocks duplicate applications", async () => {
    openConversationMock.mockResolvedValue({ channelId: "D123" });
    postMessageMock.mockResolvedValue({ ok: true, ts: "111" });

    // User has already applied and is not abandoned
    findInterestMock.mockResolvedValue({
      id: "interest-existing",
      status: "pending",
      projectId: sampleProject.id,
    });

    await startInterviewSession({
      project: sampleProject,
      userId: "U123",
      userName: "Interested User",
      initiatedBy: "U123",
    });

    // Should send message about already applied
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("already applied"),
      })
    );

    // Should NOT create new interest or start interview
    expect(createInterestMock).not.toHaveBeenCalled();
  });

  it("allows retry for abandoned applications", async () => {
    openConversationMock.mockResolvedValue({ channelId: "D123" });
    postMessageMock.mockResolvedValue({ ok: true, ts: "111" });
    getStateByChannelMock.mockResolvedValue(null);

    // User previously abandoned application
    findInterestMock.mockResolvedValue({
      id: "interest-abandoned",
      status: "abandoned",
      projectId: sampleProject.id,
    });

    await startInterviewSession({
      project: sampleProject,
      userId: "U123",
      userName: "Interested User",
      initiatedBy: "U123",
    });

    // Should update status to interviewing
    expect(updateInterestStatusMock).toHaveBeenCalledWith("interest-abandoned", "interviewing");
  });

  it("adds user to waitlist when project is at capacity", async () => {
    openConversationMock.mockResolvedValue({ channelId: "D123" });
    postMessageMock.mockResolvedValue({ ok: true, ts: "111" });

    // Project is at capacity
    checkCapacityMock.mockResolvedValue(false);

    await startInterviewSession({
      project: sampleProject,
      userId: "U123",
      userName: "Interested User",
      initiatedBy: "U123",
    });

    // Should create waitlist interest
    expect(createInterestMock).toHaveBeenCalledWith(sampleProject.id, "U123", "waitlist");

    // Should send waitlist message
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("full capacity"),
      })
    );
  });

  it("creates interest record on successful start", async () => {
    openConversationMock.mockResolvedValue({ channelId: "D123" });
    postMessageMock.mockResolvedValue({ ok: true, ts: "111" });
    getStateByChannelMock.mockResolvedValue(null);

    await startInterviewSession({
      project: sampleProject,
      userId: "U123",
      userName: "Interested User",
      initiatedBy: "U123",
    });

    // Should create interest
    expect(createInterestMock).toHaveBeenCalledWith(sampleProject.id, "U123", "pending");

    // Should update to interviewing
    expect(updateInterestStatusMock).toHaveBeenCalledWith("interest-123", "interviewing");
  });
});
