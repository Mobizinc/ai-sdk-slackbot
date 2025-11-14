import { z } from "zod";
import { getConfigValue } from "../config";
import { AnthropicChatService } from "../services/anthropic-chat";
import type { CaseClassification } from "../services/case-classifier";

export type SupervisorLlmVerdict = "pass" | "revise" | "critical";

export interface SupervisorLlmReviewIssue {
  severity: "low" | "medium" | "high";
  description: string;
  recommendation?: string;
}

export interface SupervisorLlmReview {
  verdict: SupervisorLlmVerdict;
  summary: string;
  issues: SupervisorLlmReviewIssue[];
  confidence?: number;
}

export interface LlmReviewInput {
  artifactType: "slack_message" | "servicenow_work_note";
  content: string;
  caseNumber?: string;
  classification?: CaseClassification;
}

const REVIEW_SCHEMA = z.object({
  verdict: z.enum(["pass", "revise", "critical"]),
  summary: z.string().min(4),
  confidence: z.number().min(0).max(1).optional(),
  issues: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        description: z.string().min(4),
        recommendation: z.string().optional(),
      })
    )
    .max(5)
    .default([]),
});

export async function runSupervisorLlmReview(
  input: LlmReviewInput
): Promise<SupervisorLlmReview | null> {
  const chatService = AnthropicChatService.getInstance();
  const model =
    (getConfigValue("supervisorLlmReviewModel") as string | undefined) ??
    "claude-3-5-sonnet-20241022";

  const prompt = buildPrompt(input);

  try {
    const response = await chatService.send({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a meticulous QA reviewer. Focus on clarity, tone, actionable guidance, and policy alignment. Respond ONLY via the provided tool with objective, constructive feedback. Never directly modify the content.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      tools: [
        {
          name: "review_artifact",
          description:
            "Provide qualitative QA feedback. Use verdict='pass' for publish-ready content, 'revise' when improvements are needed, and 'critical' for severe issues or policy risks.",
          inputSchema: {
            type: "object",
            properties: {
              verdict: {
                type: "string",
                enum: ["pass", "revise", "critical"],
              },
              summary: { type: "string" },
              confidence: { type: "number" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    severity: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                    },
                    description: { type: "string" },
                    recommendation: { type: "string" },
                  },
                  required: ["severity", "description"],
                },
                maxItems: 5,
              },
            },
            required: ["verdict", "summary"],
            additionalProperties: false,
          },
        },
      ],
      maxSteps: 2,
    });

    let parsed: SupervisorLlmReview | null = null;

    if (response.toolCalls.length > 0) {
      const first = response.toolCalls[0];
      parsed = REVIEW_SCHEMA.parse(first.input);
    } else if (response.outputText) {
      parsed = REVIEW_SCHEMA.parse(JSON.parse(response.outputText));
    }

    return parsed;
  } catch (error) {
    console.warn("[Supervisor][LLM] Review failed:", error);
    return null;
  }
}

function buildPrompt(input: LlmReviewInput): string {
  const classificationSummary = formatClassification(input.classification);
  return `Artifact Type: ${input.artifactType}
Case: ${input.caseNumber ?? "unknown"}

Classification Context:
${classificationSummary || "(not provided)"}

Content:
<<<
${input.content}
>>>

Review Goals:
- Ensure clarity, professional tone, and actionable guidance.
- Verify response addresses the user's request and references the right case details.
- Call out missing sections, weak next steps, or policy risks.
- Provide concise suggestions (issues array) with severity and recommended fixes.

Return your analysis via the tool only.`;
}

function formatClassification(classification?: CaseClassification): string {
  if (!classification) {
    return "";
  }

  const parts = [
    `Category: ${classification.category || "unknown"}`,
    classification.subcategory ? `Subcategory: ${classification.subcategory}` : null,
    classification.quick_summary ? `Summary: ${classification.quick_summary}` : null,
    classification.immediate_next_steps && classification.immediate_next_steps.length
      ? `Next Steps: ${classification.immediate_next_steps.join(" | ")}`
      : null,
  ].filter(Boolean);

  return parts.join("\n");
}
