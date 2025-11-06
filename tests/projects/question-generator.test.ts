import { describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("../../lib/services/anthropic-chat", () => ({
  AnthropicChatService: class {
    static getInstance() {
      return { send: sendMock };
    }
  },
}));

const { generateInterviewQuestions } = await import("../../lib/projects/question-generator");

describe("generateInterviewQuestions", () => {
  it("parses generated questions from anthropic response", async () => {
    sendMock.mockResolvedValueOnce({
      outputText: JSON.stringify({
        questions: [
          { id: "typescript_history", prompt: "Share your experience with TypeScript." },
          { id: "async_example", prompt: "Tell me about an async workflow you built." },
          { id: "collaboration_style", prompt: "How do you collaborate in remote teams?", helper: "Focus on real examples." },
        ],
      }),
    });

    const questions = await generateInterviewQuestions({
      project: {
        id: "project-123",
        name: "Sample Project",
        status: "active",
        summary: "A test project",
        techStack: ["TypeScript", "Node.js"],
        skillsRequired: ["TypeScript"],
        skillsNiceToHave: [],
        openTasks: ["Build onboarding flow"],
      } as any,
      questionCount: 3,
      model: "claude-3-haiku-20240307",
    });

    expect(questions).toHaveLength(3);
    expect(questions[0]?.id).toBe("typescript_history");
    expect(sendMock).toHaveBeenCalled();
  });

  it("throws when anthropic returns invalid JSON", async () => {
    sendMock.mockResolvedValueOnce({ outputText: "not json" });

    await expect(
      generateInterviewQuestions({
        project: {
          id: "project-123",
          name: "Sample Project",
          status: "active",
        } as any,
        questionCount: 3,
        model: "claude-3-haiku-20240307",
      }),
    ).rejects.toThrow("Failed to parse generated interview questions JSON");
  });
});
