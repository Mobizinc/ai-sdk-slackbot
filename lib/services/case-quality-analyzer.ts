/**
 * Case Quality Analyzer - Assesses whether case data is sufficient for KB generation.
 * Uses gpt-5 for accurate quality assessment at critical decision points.
 */

import { z } from "zod";
import type { CaseContext } from "../context-manager";
import { getFeatureFlags } from "../config/feature-flags";
import { AnthropicChatService } from "./anthropic-chat";

export type QualityDecision = "high_quality" | "needs_input" | "insufficient";

export interface QualityAssessment {
  decision: QualityDecision;
  score: number; // 0-100
  problemClarity: "clear" | "vague" | "missing";
  solutionClarity: "clear" | "vague" | "missing";
  stepsDocumented: boolean;
  rootCauseIdentified: boolean;
  missingInfo: string[]; // What's missing: ["root cause", "step-by-step", ...]
  reasoning: string; // Why this assessment
}

type QualityAssessmentPayload = {
  score: number;
  problemClarity: "clear" | "vague" | "missing";
  solutionClarity: "clear" | "vague" | "missing";
  stepsDocumented: boolean;
  rootCauseIdentified: boolean;
  missingInfo: string[];
  reasoning: string;
};

const QualityAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  problemClarity: z.enum(["clear", "vague", "missing"]),
  solutionClarity: z.enum(["clear", "vague", "missing"]),
  stepsDocumented: z.boolean(),
  rootCauseIdentified: z.boolean(),
  missingInfo: z.array(z.string().max(50)).max(4),
  reasoning: z.string().max(120),
}) as z.ZodTypeAny;

const QUALITY_ASSESSMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    problemClarity: { type: "string", enum: ["clear", "vague", "missing"] },
    solutionClarity: { type: "string", enum: ["clear", "vague", "missing"] },
    stepsDocumented: { type: "boolean" },
    rootCauseIdentified: { type: "boolean" },
    missingInfo: {
      type: "array",
      items: { type: "string", maxLength: 50 },
      maxItems: 4,
    },
    reasoning: { type: "string", maxLength: 120 },
  },
  required: [
    "score",
    "problemClarity",
    "solutionClarity",
    "stepsDocumented",
    "rootCauseIdentified",
    "missingInfo",
    "reasoning",
  ],
  additionalProperties: false,
};

/**
 * Assess the quality of case information for KB generation
 */
export async function assessCaseQuality(
  context: CaseContext,
  caseDetails: any | null
): Promise<QualityAssessment> {
  const flags = getFeatureFlags();
  // Build comprehensive context for analysis
  const conversationSummary = context.messages
    .map((msg) => `${msg.user}: ${msg.text}`)
    .join("\n");

  const caseInfoText = caseDetails
    ? `
Case Number: ${caseDetails.number || "N/A"}
Status: ${caseDetails.state || "N/A"}
Priority: ${caseDetails.priority || "N/A"}
Description: ${caseDetails.description || caseDetails.short_description || "N/A"}
`.trim()
    : "No ServiceNow case details available.";

  try {
    console.log("[Quality Analyzer] Assessing case quality...");

    if (flags.refactorEnabled) {
      const chatService = AnthropicChatService.getInstance();
      const response = await chatService.send({
        messages: [
          {
            role: "system",
            content:
              "You are a meticulous knowledge base quality analyst. You must call the `report_quality` tool exactly once with your structured assessment.",
          },
          {
            role: "user",
            content: `**Case Information:**\n${caseInfoText}\n\n**Conversation History:**\n${conversationSummary}\n\nAnalyze this case using the criteria provided and call the tool with your findings.`,
          },
        ],
        tools: [
          {
            name: "report_quality",
            description:
              "Return your quality assessment for the case as structured data. You must call this exactly once.",
            inputSchema: QUALITY_ASSESSMENT_JSON_SCHEMA,
          },
        ],
        maxSteps: 3,
      });

      if (response.toolCalls.length === 0) {
        throw new Error("Anthropic did not return a tool call for quality assessment");
      }

      const firstCall = response.toolCalls[0];
      const parsed = QualityAssessmentSchema.parse(firstCall.input) as QualityAssessmentPayload;

      return buildAssessment(parsed);
    }

    // Refactor not enabled - throw error
    throw new Error("AnthropicChatService not available - refactor flag disabled");
  } catch (error) {
    console.error("[Quality Analyzer] Error assessing quality:", error);

    // Fallback to medium quality on error
    return {
      decision: "needs_input",
      score: 50,
      problemClarity: "vague",
      solutionClarity: "vague",
      stepsDocumented: false,
      rootCauseIdentified: false,
      missingInfo: ["Unable to assess - analysis error"],
      reasoning: "Error during quality assessment, defaulting to needs_input",
    };
  }
}
function buildAssessment(parsed: QualityAssessmentPayload): QualityAssessment {
  let decision: QualityDecision;
  if (parsed.score >= 80) {
    decision = "high_quality";
  } else if (parsed.score >= 50) {
    decision = "needs_input";
  } else {
    decision = "insufficient";
  }

  return {
    decision,
    score: parsed.score,
    problemClarity: parsed.problemClarity,
    solutionClarity: parsed.solutionClarity,
    stepsDocumented: parsed.stepsDocumented,
    rootCauseIdentified: parsed.rootCauseIdentified,
    missingInfo: parsed.missingInfo ?? [],
    reasoning: parsed.reasoning,
  };
}

function buildAssessment(parsed: QualityAssessmentPayload): QualityAssessment {
  let decision: QualityDecision;
  if (parsed.score >= 80) {
    decision = "high_quality";
  } else if (parsed.score >= 50) {
    decision = "needs_input";
  } else {
    decision = "insufficient";
  }

  return {
    decision,
    score: parsed.score,
    problemClarity: parsed.problemClarity,
    solutionClarity: parsed.solutionClarity,
    stepsDocumented: parsed.stepsDocumented,
    rootCauseIdentified: parsed.rootCauseIdentified,
    missingInfo: parsed.missingInfo ?? [],
    reasoning: parsed.reasoning,
  };
}

// Singleton
let analyzer: typeof assessCaseQuality | null = null;

export function getCaseQualityAnalyzer() {
  if (!analyzer) {
    analyzer = assessCaseQuality;
  }
  return analyzer;
}
