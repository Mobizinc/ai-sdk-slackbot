/**
 * Case Quality Analyzer - Assesses whether case data is sufficient for KB generation.
 * Uses gpt-5 for accurate quality assessment at critical decision points.
 */

import { generateText, tool } from "../instrumented-ai";
import { z } from "zod";
import type { CaseContext } from "../context-manager";
import { modelProvider } from "../model-provider";
import { withLangSmithTrace } from "../observability/langsmith-traceable";

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

const createTool = tool as unknown as (options: any) => any;

const qualityAssessmentTool = createTool({
  description:
    "Return your quality assessment for the case as structured data. You must call this exactly once.",
  inputSchema: QualityAssessmentSchema as z.ZodTypeAny,
  execute: async (payload: QualityAssessmentPayload) => payload,
});

/**
 * Assess the quality of case information for KB generation
 */
export async function assessCaseQuality(
  context: CaseContext,
  caseDetails: any | null
): Promise<QualityAssessment> {
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

    const result = await generateText({
      model: modelProvider.languageModel("quality-analyzer"),
      system:
        "You are a meticulous knowledge base quality analyst. You must call the `report_quality` tool exactly once with your structured assessment.",
      prompt: `**Case Information:**\n${caseInfoText}\n\n**Conversation History:**\n${conversationSummary}\n\nAnalyze this case using the criteria provided and call the tool with your findings.`,
      tools: {
        report_quality: qualityAssessmentTool,
      },
      toolChoice: { type: "tool", toolName: "report_quality" },
    });

    const toolResult = result.toolResults[0];

    if (!toolResult || toolResult.type !== "tool-result") {
      throw new Error("Model did not return a structured quality assessment");
    }

    const parsed = QualityAssessmentSchema.parse(toolResult.output) as QualityAssessmentPayload;

    // Determine decision based on score
    let decision: QualityDecision;
    if (parsed.score >= 80) {
      decision = "high_quality";
    } else if (parsed.score >= 50) {
      decision = "needs_input";
    } else {
      decision = "insufficient";
    }

    const assessment: QualityAssessment = {
      decision,
      score: parsed.score,
      problemClarity: parsed.problemClarity,
      solutionClarity: parsed.solutionClarity,
      stepsDocumented: parsed.stepsDocumented,
      rootCauseIdentified: parsed.rootCauseIdentified,
      missingInfo: parsed.missingInfo ?? [],
      reasoning: parsed.reasoning,
    };

    console.log(`[Quality Analyzer] Assessment: ${decision} (score: ${assessment.score})`);
    console.log(`[Quality Analyzer] Missing: ${assessment.missingInfo.join(", ")}`);

    return assessment;
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

// Singleton
let analyzer: typeof assessCaseQuality | null = null;

export function getCaseQualityAnalyzer() {
  if (!analyzer) {
    analyzer = withLangSmithTrace(assessCaseQuality, {
      name: "KB.CaseQualityAssessment",
      run_type: "chain",
    });
  }
  return analyzer;
}
