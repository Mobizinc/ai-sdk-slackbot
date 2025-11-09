import { AnthropicChatService } from "../services/anthropic-chat";
import type { InterviewAnswer, ProjectDefinition, EnhancedMatchScore } from "./types";

/**
 * Legacy MatchScore interface - kept for backward compatibility
 * Use EnhancedMatchScore for new code
 */
export interface MatchScore {
  score: number;
  summary: string;
  recommendedTasks: string[];
  concerns?: string;
}

export type { EnhancedMatchScore };

const chatService = AnthropicChatService.getInstance();
const DEFAULT_SCORING_PROMPT =
  "You evaluate candidate interviews for internal mentoring projects. " +
  "Review the project requirements and interview transcript, then provide a JSON evaluation with keys: " +
  "`score` (0-100), `summary` (2-3 sentence assessment), `recommendedTasks` (array of specific tasks), " +
  "`concerns` (optional string), `skillGaps` (array of missing/weak required or nice-to-have skills), " +
  "`onboardingRecommendations` (array of resources/tutorials to review before starting), " +
  "`strengths` (array of specific skills/experiences matching project needs), " +
  "`timeToProductivity` (estimated timeline: 'immediate', '1-2 weeks', '3-4 weeks', or '1-2 months')";

function buildEvaluationPrompt(project: ProjectDefinition, answers: InterviewAnswer[]): string {
  const answerLines = answers
    .map(
      (answer, index) =>
        `Question ${index + 1} (${answer.questionId}): ${answer.prompt}\nAnswer: ${answer.response}\n`,
    )
    .join("\n");

  const projectSummary = [
    `Project: ${project.name}`,
    project.summary ? `Summary: ${project.summary}` : "",
    project.background ? `Background: ${project.background}` : "",
    project.techStack?.length ? `Tech stack: ${project.techStack.join(", ")}` : "",
    project.skillsRequired?.length ? `Required skills: ${project.skillsRequired.join(", ")}` : "",
    project.skillsNiceToHave?.length ? `Nice to have: ${project.skillsNiceToHave.join(", ")}` : "",
    project.openTasks?.length ? `Open tasks: ${project.openTasks.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${projectSummary}

Candidate interview responses:

${answerLines}
`;
}

function parseMatchResponse(text?: string): MatchScore {
  if (!text) {
    return {
      score: 50,
      summary: "Interview evaluation incomplete. No summary provided.",
      recommendedTasks: [],
    };
  }

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      score: Math.round(Math.max(0, Math.min(100, Number(parsed.score) || 0))),
      summary: String(parsed.summary || "No summary provided."),
      recommendedTasks: Array.isArray(parsed.recommendedTasks)
        ? parsed.recommendedTasks.map((task: unknown) => String(task))
        : [],
      concerns: parsed.concerns ? String(parsed.concerns) : undefined,
    };
  } catch (error) {
    console.warn("[Project Matching] Failed to parse model response", error);
    return {
      score: 50,
      summary: text,
      recommendedTasks: [],
    };
  }
}

/**
 * Parse enhanced match response with all new fields
 * Handles skill gaps, onboarding recommendations, strengths, and time-to-productivity
 */
function parseEnhancedMatchResponse(text?: string): EnhancedMatchScore {
  if (!text) {
    return {
      score: 50,
      summary: "Interview evaluation incomplete. No summary provided.",
      recommendedTasks: [],
      skillGaps: [],
      onboardingRecommendations: [],
      strengths: [],
      timeToProductivity: "unknown",
    };
  }

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      score: Math.round(Math.max(0, Math.min(100, Number(parsed.score) || 0))),
      summary: String(parsed.summary || "No summary provided."),
      recommendedTasks: Array.isArray(parsed.recommendedTasks)
        ? parsed.recommendedTasks.map((task: unknown) => String(task))
        : [],
      concerns: parsed.concerns ? String(parsed.concerns) : undefined,
      skillGaps: Array.isArray(parsed.skillGaps)
        ? parsed.skillGaps.map((gap: unknown) => String(gap))
        : [],
      onboardingRecommendations: Array.isArray(parsed.onboardingRecommendations)
        ? parsed.onboardingRecommendations.map((rec: unknown) => String(rec))
        : [],
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.map((strength: unknown) => String(strength))
        : [],
      timeToProductivity: String(parsed.timeToProductivity || "unknown"),
    };
  } catch (error) {
    console.warn("[Project Matching] Failed to parse enhanced model response", error);
    return {
      score: 50,
      summary: text,
      recommendedTasks: [],
      skillGaps: [],
      onboardingRecommendations: [],
      strengths: [],
      timeToProductivity: "unknown",
    };
  }
}

export async function scoreInterviewAgainstProject(
  project: ProjectDefinition,
  answers: InterviewAnswer[],
  scoringPrompt?: string,
): Promise<MatchScore> {
  const prompt = buildEvaluationPrompt(project, answers);
  const systemPrompt = scoringPrompt?.trim().length ? scoringPrompt : DEFAULT_SCORING_PROMPT;

  const response = await chatService.send({
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: prompt + "\nReturn JSON only.",
      },
    ],
    temperature: 0.2,
    maxTokens: 300,
  });

  return parseMatchResponse(response.outputText?.trim());
}

/**
 * Score interview with enhanced evaluation including skill gaps, strengths, and onboarding recommendations
 * This is the recommended function for new implementations
 */
export async function scoreInterviewEnhanced(
  project: ProjectDefinition,
  answers: InterviewAnswer[],
  scoringPrompt?: string,
): Promise<EnhancedMatchScore> {
  const prompt = buildEvaluationPrompt(project, answers);
  const systemPrompt = scoringPrompt?.trim().length ? scoringPrompt : DEFAULT_SCORING_PROMPT;

  const response = await chatService.send({
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: prompt + "\nReturn JSON only.",
      },
    ],
    temperature: 0.2,
    maxTokens: 500, // Increased tokens for more detailed response
  });

  return parseEnhancedMatchResponse(response.outputText?.trim());
}
