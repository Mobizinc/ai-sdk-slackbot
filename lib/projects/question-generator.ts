import { AnthropicChatService } from "../services/anthropic-chat";
import { interviewQuestionSchema, interviewGeneratorSchema, type ProjectDefinition, type InterviewQuestion } from "./types";
import { z } from "zod";

const generatorResponseSchema = z.object({
  questions: z.array(interviewQuestionSchema).min(3, "Generated at least three questions"),
});

const chatService = AnthropicChatService.getInstance();

export interface GenerateQuestionsOptions {
  project: ProjectDefinition;
  questionCount: number;
  model: string;
  styleGuidance?: string;
}

export async function generateInterviewQuestions(options: GenerateQuestionsOptions): Promise<InterviewQuestion[]> {
  interviewGeneratorSchema.parse({
    model: options.model,
    questionCount: options.questionCount,
    styleGuidance: options.styleGuidance,
  });

  const prompt = buildPrompt(options);

  const response = await chatService.send({
    model: options.model,
    messages: [
      {
        role: "system",
        content:
          "You are Claude Haiku 4.5 acting as an interview design assistant. " +
          "Create concise, practical questions that reveal a junior developer's readiness to contribute to an internal project. " +
          "Return valid JSON matching the required schema. Do not include explanations or extra keys.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.3,
    maxTokens: 600,
  });

  const text = response.outputText?.trim();
  if (!text) {
    throw new Error("Anthropic response did not include text output");
  }

  const cleaned = text.replace(/```json|```/g, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error("Failed to parse generated interview questions JSON", { cause: error });
  }

  const result = generatorResponseSchema.parse(parsed);
  return result.questions.slice(0, options.questionCount);
}

function buildPrompt(options: GenerateQuestionsOptions): string {
  const { project, questionCount, styleGuidance } = options;

  const lines: string[] = [
    `Project Name: ${project.name}`,
    project.summary ? `Summary: ${project.summary}` : "",
    project.background ? `Background: ${project.background}` : "",
    project.techStack?.length ? `Tech Stack: ${project.techStack.join(", ")}` : "",
    project.skillsRequired?.length ? `Required Skills: ${project.skillsRequired.join(", ")}` : "",
    project.skillsNiceToHave?.length ? `Nice to Have Skills: ${project.skillsNiceToHave.join(", ")}` : "",
    project.openTasks?.length ? `Open Tasks: ${project.openTasks.join(", ")}` : "",
  ].filter(Boolean);

  if (styleGuidance) {
    lines.push(`Style Guidance: ${styleGuidance}`);
  }

  lines.push(
    `Generate ${questionCount} interview questions. Each question must be an object with keys "id", "prompt", and optional "helper".`,
    "Return JSON in the format: { \"questions\": [ { \"id\": string, \"prompt\": string, \"helper\"?: string } ] }",
    "Question ids should be lowercase with underscores and describe the topic (e.g., typescript_experience).",
    "Prompts should be direct and invite concrete examples. Use helper text sparingly for clarification only.",
  );

  return lines.join("\n");
}
