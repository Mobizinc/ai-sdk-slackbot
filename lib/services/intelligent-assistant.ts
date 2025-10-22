/**
 * Intelligent Assistant - Provides proactive case guidance using similar case search and AI synthesis.
 * Inspired by mobiz-intelligence-analytics case intelligence system.
 */

import { generateText, tool } from "../instrumented-ai";
import { z } from "zod";
import type { AzureSearchService, SimilarCase } from "./azure-search";
import type { ServiceNowCaseResult } from "../tools/servicenow";
import { getBusinessContextService } from "./business-context-service";
import { modelProvider } from "../model-provider";
import { config } from "../config";

/**
 * Check if a case is in an active state that warrants intelligent assistance.
 * Returns true if the case is open/in-progress/pending, false if closed/resolved/cancelled.
 */
export function shouldProvideAssistance(caseDetails: ServiceNowCaseResult | null): boolean {
  if (!caseDetails) {
    // No case details available - provide assistance by default
    return true;
  }

  const caseState = caseDetails.state;
  if (!caseState) {
    // No state info - provide assistance by default
    return true;
  }

  // Check if state is in the configured active states list
  const isActive = config.assistantActiveStates.some(
    (activeState) => caseState.toLowerCase().includes(activeState.toLowerCase())
  );

  if (!isActive) {
    console.log(`[Intelligent Assistant] Skipping assistance for ${caseDetails.number || 'case'} - state "${caseState}" not in active states`);
  }

  return isActive;
}

export interface CaseGuidance {
  similarCases: string[];
  suggestions: string[];
  nextSteps: string[];
}

type CaseGuidancePayload = {
  similarCases: string[];
  suggestions: string[];
  nextSteps: string[];
};

const CaseGuidanceSchema = z.object({
  similarCases: z.array(z.string().max(120)).min(1).max(3),
  suggestions: z.array(z.string().max(100)).min(1).max(4),
  nextSteps: z.array(z.string().max(100)).min(1).max(3),
}) as z.ZodTypeAny;

const createTool = tool as unknown as (options: any) => any;

const guidanceTool = createTool({
  description:
    "Provide actionable guidance for the analyst. Call exactly once with structured bullet points.",
  inputSchema: CaseGuidanceSchema as z.ZodTypeAny,
  execute: async (payload: CaseGuidancePayload) => payload,
});

/**
 * Generate intelligent assistance message when a case is first detected.
 * Searches for similar cases and synthesizes actionable guidance.
 */
export async function buildIntelligentAssistance(
  caseNumber: string,
  caseDetails: ServiceNowCaseResult | null,
  searchService: AzureSearchService | null,
  channelName?: string,
  channelTopic?: string,
  channelPurpose?: string
): Promise<string> {
  let message = `👋 I see you're working on *${caseNumber}*`;

  if (channelName) {
    message += ` in #${channelName}`;
  }

  // Add basic case info
  if (caseDetails) {
    const status = caseDetails.state || "Unknown";
    const priority = caseDetails.priority ? `P${caseDetails.priority}` : "";
    const description = caseDetails.short_description || "";

    message += `\n\n`;
    message += `*Status:* ${status}`;
    if (priority) message += ` | *Priority:* ${priority}`;
    if (description) {
      const truncated =
        description.length > 100
          ? description.substring(0, 100) + "..."
          : description;
      message += `\n*Issue:* ${truncated}`;
    }
  }

  // Search for similar cases and generate guidance
  const problemDescription = caseDetails?.description || caseDetails?.short_description || "";

  if (!searchService) {
    console.warn(`[Intelligent Assistant] Azure Search not configured - skipping similarity search for ${caseNumber}`);
  } else if (!caseDetails) {
    console.log(`[Intelligent Assistant] No case details available for ${caseNumber} - skipping similarity search`);
  } else if (!problemDescription) {
    console.log(`[Intelligent Assistant] No problem description for ${caseNumber} - skipping similarity search`);
  } else {
    try {
      console.log(`[Intelligent Assistant] Searching for similar cases to ${caseNumber}: "${problemDescription.substring(0, 100)}${problemDescription.length > 100 ? '...' : ''}"`);

      const guidance = await generateProactiveGuidance(
        caseDetails,
        searchService,
        channelName,
        channelTopic,
        channelPurpose
      );

      if (guidance) {
        console.log(`[Intelligent Assistant] Generated guidance for ${caseNumber}`);
        message += `\n\n${guidance}`;
      } else {
        console.log(`[Intelligent Assistant] No guidance generated for ${caseNumber} (no similar cases or description too short)`);
      }
    } catch (error) {
      console.error("[Intelligent Assistant] Error generating guidance:", {
        caseNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        hasSearchService: !!searchService,
        descriptionLength: problemDescription.length
      });
      // Continue without guidance - don't block the message
    }
  }

  message += `\n\n_I'll track this conversation for knowledge base generation._ 📝`;

  return message;
}

/**
 * Generate proactive guidance by searching similar cases and synthesizing with AI.
 */
async function generateProactiveGuidance(
  caseDetails: ServiceNowCaseResult,
  searchService: AzureSearchService,
  channelName?: string,
  channelTopic?: string,
  channelPurpose?: string
): Promise<string | null> {
  const problemDescription = caseDetails.description || caseDetails.short_description || "";

  if (
    !problemDescription ||
    problemDescription.length < config.assistantMinDescriptionLength
  ) {
    // Too vague to search with current threshold
    console.log(
      `[Intelligent Assistant] Description too short for search: "${problemDescription}" (${problemDescription.length} chars)`,
    );
    return null;
  }

  // Search for similar historical cases
  console.log(`[Intelligent Assistant] Calling Azure Search with query: "${problemDescription.substring(0, 80)}..."`);

  const similarCases = await searchService.searchSimilarCases(problemDescription, {
    topK: config.assistantSimilarCasesTopK,
  });

  console.log(`[Intelligent Assistant] Azure Search returned ${similarCases.length} similar cases`);

  if (similarCases.length === 0) {
    console.log(`[Intelligent Assistant] No similar cases found - skipping guidance generation`);
    return null; // No similar cases found
  }

  // Log similar cases found
  similarCases.forEach((c, idx) => {
    console.log(`[Intelligent Assistant]   ${idx + 1}. ${c.case_number} (score: ${c.score.toFixed(2)})`);
  });

  // Use gpt-5 to synthesize guidance from similar cases
  const guidance = await synthesizeGuidance(
    caseDetails,
    similarCases,
    channelName,
    channelTopic,
    channelPurpose
  );

  return guidance;
}

/**
 * Synthesize actionable guidance from similar cases using gpt-5.
 */
async function synthesizeGuidance(
  currentCase: ServiceNowCaseResult,
  similarCases: SimilarCase[],
  channelName?: string,
  channelTopic?: string,
  channelPurpose?: string
): Promise<string> {
  const currentProblem = currentCase.description || currentCase.short_description || "";

  const similarCasesContext = similarCases
    .map((c, idx) => {
      return `${idx + 1}. Case ${c.case_number} (similarity: ${(c.score * 100).toFixed(0)}%)
${c.content.substring(0, 300)}...`;
    })
    .join("\n\n");

  const basePrompt = `You are a Service Desk AI assistant helping an engineer troubleshoot a case.

**Current Case:**
${currentProblem}

**Similar Historical Cases:**
${similarCasesContext}

When ready, call the \`draft_case_guidance\` tool EXACTLY ONCE with:
- similarCases: 1-3 bullet strings summarising matched cases (case number + fix)
- suggestions: 2-4 tactical troubleshooting ideas (≤80 chars each)
- nextSteps: 1-3 immediate follow-up actions (≤80 chars each)

Prioritise actionable insights only.`;

  try {
    // Enhance prompt with business context
    const businessContextService = getBusinessContextService();
    const enhancedPrompt = await businessContextService.enhancePromptWithContext(
      basePrompt,
      channelName,
      channelTopic,
      channelPurpose
    );

    const result = await generateText({
      model: modelProvider.languageModel("intelligent-assistant"),
      system:
        "You are a proactive support co-pilot. ALWAYS call the `draft_case_guidance` tool exactly once with concise bullets.",
      prompt: enhancedPrompt,
      tools: {
        draft_case_guidance: guidanceTool,
      },
      toolChoice: { type: "tool", toolName: "draft_case_guidance" },
    });

    const toolResult = result.toolResults[0];

    if (!toolResult || toolResult.type !== "tool-result") {
      throw new Error("Structured guidance not returned");
    }

    const structured = CaseGuidanceSchema.parse(toolResult.output) as CaseGuidancePayload;

    return formatGuidanceMessage(structured);
  } catch (error) {
    console.error("[Intelligent Assistant] Error synthesizing guidance:", error);

    // Fallback: simple list of similar cases
    const fallback = `*Similar Cases Found:*\n${similarCases
      .map((c) => `• ${c.case_number} - ${c.content.substring(0, 80)}...`)
      .join("\n")}`;

    return fallback;
  }
}

function formatGuidanceMessage(guidance: CaseGuidance): string {
  let message = "*Similar Cases Found:*";
  message += "\n" + guidance.similarCases.map((item) => `• ${item}`).join("\n");

  if (guidance.suggestions.length > 0) {
    message += "\n\n*Suggestions:*\n" + guidance.suggestions.map((item) => `• ${item}`).join("\n");
  }

  if (guidance.nextSteps.length > 0) {
    message += "\n\n*Next Steps:*\n" + guidance.nextSteps.map((item) => `• ${item}`).join("\n");
  }

  return message;
}
