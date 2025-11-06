import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("../../lib/services/anthropic-chat", () => ({
  AnthropicChatService: class {
    static getInstance() {
      return { send: mocks.send };
    }
  },
}));

vi.mock("../../lib/db/client", () => ({
  getDb: vi.fn(() => null),
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn(async (file: string) => `Content for ${file}`),
}));

import { generateProjectInitiationDraft } from "../../lib/projects/initiation-service";
import type { ProjectDefinition } from "../../lib/projects/types";

const baseProject: ProjectDefinition = {
  id: "project-123",
  name: "Sample Init Project",
  status: "active",
  summary: "Accelerate internal tooling",
  background: "Leadership sponsors an initiative to improve developer velocity.",
  techStack: ["TypeScript", "Node.js"],
  skillsRequired: ["TypeScript", "REST APIs"],
  skillsNiceToHave: ["LLM experience"],
  difficultyLevel: "intermediate",
  estimatedHours: "5-8 hrs/week",
  learningOpportunities: ["Event-driven architecture", "Prompt design"],
  openTasks: ["Audit current command catalog", "Prototype new onboarding flow"],
  mentor: { slackUserId: "U123", name: "Lead Mentor" },
  interview: undefined,
  standup: undefined,
  maxCandidates: 3,
  postedDate: undefined,
  expiresDate: undefined,
  channelId: "CINIT",
};

const mockLLMResponse = {
  shortPitch: "Spark progress on internal developer tools",
  elevatorPitch: "Help us modernise the AI SDK Slackbot and accelerate unblock cycles across squads.",
  problemStatement: "Internal teams wait too long for answers and need better automation.",
  solutionOverview: "Ship guided improvements to the Slackbot assistant, aligning FAQ knowledge and proactive workflows.",
  keyValueProps: ["Mentored project", "High visibility"],
  learningHighlights: ["Prompt engineering", "Metrics-driven iteration"],
  kickoffChecklist: ["Review backlog", "Confirm mentors", "Plan first sprint"],
  standupGuidance: ["Async stand-ups", "Reference issue links"],
  interviewThemes: ["System thinking", "Async collaboration"],
  recommendedMetrics: ["Response time", "Adoption"],
  blockKit: { blocks: [{ type: "section", text: { type: "mrkdwn", text: "Sample" } }] },
  notes: ["Sync with platform guild"],
};

describe("generateProjectInitiationDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns LLM-crafted output when response is valid JSON", async () => {
    mocks.send.mockResolvedValueOnce({
      outputText: JSON.stringify(mockLLMResponse),
    });

    const draft = await generateProjectInitiationDraft({
      project: baseProject,
      requestedBy: "U999",
      requestedByName: "Requester",
      ideaSummary: "Focus on faster case triage",
    });

    expect(draft.output.shortPitch).toBe(mockLLMResponse.shortPitch);
    expect(Array.isArray(draft.sources)).toBe(true);
    expect(mocks.send).toHaveBeenCalled();
  });

  it("falls back to default narrative when parsing fails", async () => {
    mocks.send.mockResolvedValueOnce({ outputText: "{ not-json" });

    const draft = await generateProjectInitiationDraft({
      project: baseProject,
      requestedBy: "U999",
    });

    expect(draft.output.shortPitch.length).toBeGreaterThan(0);
    expect(draft.output.kickoffChecklist.length).toBeGreaterThan(0);
  });
});
