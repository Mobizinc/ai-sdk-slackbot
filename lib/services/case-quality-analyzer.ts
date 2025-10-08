/**
 * Case Quality Analyzer - Assesses whether case data is sufficient for KB generation.
 * Uses gpt-5 for accurate quality assessment at critical decision points.
 */

import { generateText } from "ai";
import type { CaseContext } from "../context-manager";
import { sanitizeModelConfig } from "../model-capabilities";
import { selectLanguageModel } from "../model-provider";

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

  const prompt = `You are a knowledge base quality analyst. Assess whether the following case has enough information to create a useful knowledge base article.

**Case Information:**
${caseInfoText}

**Conversation History:**
${conversationSummary}

**Assessment Criteria:**

1. **Problem Clarity**: Is the issue clearly described?
   - Clear: Specific symptoms, error messages, or user impact
   - Vague: Generic description like "not working"
   - Missing: No problem description

2. **Solution Clarity**: Is the resolution explained?
   - Clear: Specific actions taken, tools used, or config changed
   - Vague: "Fixed it" or "Restarted service" without detail
   - Missing: No resolution mentioned

3. **Steps Documented**: Are there actionable step-by-step instructions?
   - Yes: Can someone follow the steps to reproduce the fix
   - No: Steps missing or too vague

4. **Root Cause**: Is the underlying cause identified?
   - Yes: Why the problem occurred is explained
   - No: Only symptoms/fix without cause

**Your Task:**
Analyze this case and return a JSON object with your assessment.

**Scoring Guide:**
- 80-100: High quality - Can generate excellent KB article
- 50-79: Medium quality - Needs more detail from user
- 0-49: Low quality - Insufficient for KB article

**CRITICAL: Keep Output Concise**
- "missingInfo": MAX 3-4 items, each ≤50 characters
- Focus ONLY on critical gaps: problem details, solution steps, or root cause
- Good: ["Resolution steps", "Error message", "Root cause"]
- Bad: ["Operating system version and environment configuration details"]
- "reasoning": 1 sentence max, ≤100 characters

Return ONLY valid JSON in this format:
{
  "score": <number 0-100>,
  "problemClarity": "clear" | "vague" | "missing",
  "solutionClarity": "clear" | "vague" | "missing",
  "stepsDocumented": true | false,
  "rootCauseIdentified": true | false,
  "missingInfo": [<max 3-4 short items, each ≤50 chars>],
  "reasoning": "<1 sentence, ≤100 chars>"
}`;

  try {
    console.log("[Quality Analyzer] Assessing case quality...");

    const modelSelection = selectLanguageModel();

    const generationConfig = sanitizeModelConfig(modelSelection.modelId, {
      model: modelSelection.model,
      prompt,
    });

    const { text } = await generateText(generationConfig);

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in quality assessment response");
    }

    const result = JSON.parse(jsonMatch[0]);

    // Determine decision based on score
    let decision: QualityDecision;
    if (result.score >= 80) {
      decision = "high_quality";
    } else if (result.score >= 50) {
      decision = "needs_input";
    } else {
      decision = "insufficient";
    }

    const assessment: QualityAssessment = {
      decision,
      score: result.score,
      problemClarity: result.problemClarity,
      solutionClarity: result.solutionClarity,
      stepsDocumented: result.stepsDocumented,
      rootCauseIdentified: result.rootCauseIdentified,
      missingInfo: result.missingInfo || [],
      reasoning: result.reasoning,
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
    analyzer = assessCaseQuality;
  }
  return analyzer;
}
