import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreInterviewAgainstProject, scoreInterviewEnhanced } from "../../lib/projects/matching-service";
import type { ProjectDefinition, InterviewAnswer } from "../../lib/projects/types";

// Mock the Anthropic chat service
vi.mock("../../lib/services/anthropic-chat", () => ({
  AnthropicChatService: {
    getInstance: vi.fn(() => ({
      send: vi.fn(),
    })),
  },
}));

import { AnthropicChatService } from "../../lib/services/anthropic-chat";

const mockProject: ProjectDefinition = {
  id: "test-project",
  name: "Test Project",
  summary: "A test project",
  status: "active",
  skillsRequired: ["TypeScript", "React"],
  skillsNiceToHave: ["Next.js"],
  techStack: ["Node.js", "React"],
} as any;

const mockAnswers: InterviewAnswer[] = [
  {
    questionId: "q1",
    prompt: "Tell us about your TypeScript experience",
    response: "I have 5 years of TypeScript experience",
  },
  {
    questionId: "q2",
    prompt: "What frameworks have you used?",
    response: "React, Vue, and Angular",
  },
  {
    questionId: "q3",
    prompt: "What do you want to learn?",
    response: "I want to learn more about Next.js",
  },
];

describe("Matching Service", () => {
  let mockChatService: any;

  beforeEach(() => {
    mockChatService = AnthropicChatService.getInstance();
    vi.clearAllMocks();
  });

  describe("scoreInterviewAgainstProject (legacy)", () => {
    it("should parse basic match score response", async () => {
      const mockResponse = {
        outputText: JSON.stringify({
          score: 85,
          summary: "Strong candidate with relevant experience",
          recommendedTasks: ["Review codebase", "Set up dev environment"],
          concerns: "Limited Next.js experience",
        }),
      };

      mockChatService.send.mockResolvedValue(mockResponse);

      const result = await scoreInterviewAgainstProject(mockProject, mockAnswers);

      expect(result.score).toBe(85);
      expect(result.summary).toBe("Strong candidate with relevant experience");
      expect(result.recommendedTasks).toHaveLength(2);
      expect(result.concerns).toBe("Limited Next.js experience");
    });

    it("should handle malformed JSON response", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: "Not valid JSON",
      });

      const result = await scoreInterviewAgainstProject(mockProject, mockAnswers);

      expect(result.score).toBe(50); // Default fallback
      expect(result.summary).toBe("Not valid JSON");
      expect(result.recommendedTasks).toEqual([]);
    });

    it("should handle empty response", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: undefined,
      });

      const result = await scoreInterviewAgainstProject(mockProject, mockAnswers);

      expect(result.score).toBe(50);
      expect(result.summary).toContain("incomplete");
      expect(result.recommendedTasks).toEqual([]);
    });

    it("should clamp score between 0-100", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 150, // Invalid score
          summary: "Test",
          recommendedTasks: [],
        }),
      });

      const result = await scoreInterviewAgainstProject(mockProject, mockAnswers);

      expect(result.score).toBe(100);
    });

    it("should handle negative scores", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: -50,
          summary: "Test",
          recommendedTasks: [],
        }),
      });

      const result = await scoreInterviewAgainstProject(mockProject, mockAnswers);

      expect(result.score).toBe(0);
    });

    it("should use custom scoring prompt", async () => {
      const customPrompt = "Custom evaluation prompt";
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 75,
          summary: "Custom prompt evaluation",
          recommendedTasks: [],
        }),
      });

      await scoreInterviewAgainstProject(mockProject, mockAnswers, customPrompt);

      expect(mockChatService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "system",
              content: customPrompt,
            }),
          ]),
        })
      );
    });
  });

  describe("scoreInterviewEnhanced", () => {
    it("should parse enhanced match score with all fields", async () => {
      const mockResponse = {
        outputText: JSON.stringify({
          score: 85,
          summary: "Strong candidate with relevant experience",
          recommendedTasks: ["Review codebase", "Set up dev environment"],
          concerns: "Limited Next.js experience",
          skillGaps: ["Next.js", "GraphQL"],
          onboardingRecommendations: [
            "Complete Next.js tutorial",
            "Review project architecture docs",
          ],
          strengths: ["TypeScript proficiency", "React expertise", "Strong fundamentals"],
          timeToProductivity: "1-2 weeks",
        }),
      };

      mockChatService.send.mockResolvedValue(mockResponse);

      const result = await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(result.score).toBe(85);
      expect(result.summary).toBe("Strong candidate with relevant experience");
      expect(result.recommendedTasks).toHaveLength(2);
      expect(result.concerns).toBe("Limited Next.js experience");
      expect(result.skillGaps).toEqual(["Next.js", "GraphQL"]);
      expect(result.onboardingRecommendations).toHaveLength(2);
      expect(result.strengths).toEqual(["TypeScript proficiency", "React expertise", "Strong fundamentals"]);
      expect(result.timeToProductivity).toBe("1-2 weeks");
    });

    it("should provide default values for missing enhanced fields", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 75,
          summary: "Good fit",
          recommendedTasks: [],
        }),
      });

      const result = await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(result.score).toBe(75);
      expect(result.skillGaps).toEqual([]);
      expect(result.onboardingRecommendations).toEqual([]);
      expect(result.strengths).toEqual([]);
      expect(result.timeToProductivity).toBe("unknown");
    });

    it("should handle malformed enhanced JSON", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: "Invalid JSON response",
      });

      const result = await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(result.score).toBe(50);
      expect(result.skillGaps).toEqual([]);
      expect(result.onboardingRecommendations).toEqual([]);
      expect(result.strengths).toEqual([]);
    });

    it("should use higher token limit for enhanced scoring", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 80,
          summary: "Test",
          recommendedTasks: [],
          skillGaps: [],
          onboardingRecommendations: [],
          strengths: [],
          timeToProductivity: "immediate",
        }),
      });

      await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(mockChatService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 500, // Enhanced uses 500 vs legacy 300
        })
      );
    });

    it("should categorize time to productivity", async () => {
      const timelines = [
        { input: "immediate", expected: "immediate" },
        { input: "1-2 weeks", expected: "1-2 weeks" },
        { input: "3-4 weeks", expected: "3-4 weeks" },
        { input: "1-2 months", expected: "1-2 months" },
      ];

      for (const timeline of timelines) {
        mockChatService.send.mockResolvedValue({
          outputText: JSON.stringify({
            score: 80,
            summary: "Test",
            recommendedTasks: [],
            skillGaps: [],
            onboardingRecommendations: [],
            strengths: [],
            timeToProductivity: timeline.input,
          }),
        });

        const result = await scoreInterviewEnhanced(mockProject, mockAnswers);

        expect(result.timeToProductivity).toBe(timeline.expected);
      }
    });

    it("should handle multiple skill gaps and recommendations", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 70,
          summary: "Solid candidate",
          recommendedTasks: [],
          skillGaps: ["Next.js", "TypeORM", "Docker", "Kubernetes"],
          onboardingRecommendations: [
            "Next.js tutorial",
            "TypeORM documentation",
            "Docker getting started guide",
            "Our project setup guide",
            "Team conventions doc",
          ],
          strengths: ["React", "TypeScript", "JavaScript", "Problem solving"],
          timeToProductivity: "3-4 weeks",
        }),
      };

      const result = await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(result.skillGaps).toHaveLength(4);
      expect(result.onboardingRecommendations).toHaveLength(5);
      expect(result.strengths).toHaveLength(4);
    });

    it("should convert array fields to strings if needed", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 80,
          summary: "Test",
          recommendedTasks: [],
          skillGaps: ["skill1", "skill2"],
          onboardingRecommendations: ["rec1", "rec2"],
          strengths: ["strength1", "strength2"],
          timeToProductivity: "1-2 weeks",
        }),
      });

      const result = await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(typeof result.skillGaps[0]).toBe("string");
      expect(typeof result.onboardingRecommendations[0]).toBe("string");
      expect(typeof result.strengths[0]).toBe("string");
    });

    it("should handle empty skill gaps and strengths", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 95,
          summary: "Excellent match",
          recommendedTasks: ["Task 1"],
          skillGaps: [],
          onboardingRecommendations: ["Just onboarding"],
          strengths: [],
          timeToProductivity: "immediate",
        }),
      });

      const result = await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(result.skillGaps).toEqual([]);
      expect(result.strengths).toEqual([]);
      expect(result.onboardingRecommendations).toHaveLength(1);
      expect(result.timeToProductivity).toBe("immediate");
    });

    it("should include enhanced fields in API call", async () => {
      mockChatService.send.mockResolvedValue({
        outputText: JSON.stringify({
          score: 80,
          summary: "Test",
          recommendedTasks: [],
          skillGaps: [],
          onboardingRecommendations: [],
          strengths: [],
          timeToProductivity: "1-2 weeks",
        }),
      });

      await scoreInterviewEnhanced(mockProject, mockAnswers);

      const callArgs = mockChatService.send.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: any) => m.role === "user");

      // Should request enhanced fields in the prompt
      expect(userMessage.content).toContain("skillGaps");
      expect(userMessage.content).toContain("onboardingRecommendations");
      expect(userMessage.content).toContain("strengths");
      expect(userMessage.content).toContain("timeToProductivity");
    });
  });

  describe("Score comparison", () => {
    it("legacy and enhanced should produce same base score", async () => {
      const response = JSON.stringify({
        score: 88,
        summary: "Excellent candidate",
        recommendedTasks: ["Task 1", "Task 2"],
        concerns: "Minimal concerns",
        skillGaps: ["GraphQL"],
        onboardingRecommendations: ["GraphQL tutorial"],
        strengths: ["TypeScript", "React"],
        timeToProductivity: "1-2 weeks",
      });

      mockChatService.send.mockResolvedValueOnce({ outputText: response });
      const legacyResult = await scoreInterviewAgainstProject(mockProject, mockAnswers);

      mockChatService.send.mockResolvedValueOnce({ outputText: response });
      const enhancedResult = await scoreInterviewEnhanced(mockProject, mockAnswers);

      expect(legacyResult.score).toBe(enhancedResult.score);
      expect(legacyResult.summary).toBe(enhancedResult.summary);
    });
  });
});
