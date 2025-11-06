import { AnthropicChatService } from "../services/anthropic-chat";
import type { InterviewAnswer, ProjectDefinition } from "./types";

export interface MatchScore {
  score: number;
  summary: string;
  recommendedTasks: string[];
  concerns?: string;
}

const chatService = AnthropicChatService.getInstance();
const DEFAULT_SCORING_PROMPT =
  "You evaluate candidate interviews for internal mentoring projects. " +
  "Review the project requirements and interview transcript, then provide a JSON evaluation with keys: " +
  "`score` (0-100), `summary` (2-3 sentence assessment), `recommendedTasks` (array of specific tasks the candidate could start with), and optional `concerns` (string).";

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
