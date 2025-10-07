/**
 * Intelligent Assistant - Provides proactive case guidance using similar case search and AI synthesis.
 * Inspired by mobiz-intelligence-analytics case intelligence system.
 */

import { generateText } from "ai";
import type { AzureSearchService, SimilarCase } from "./azure-search";
import type { ServiceNowCaseResult } from "../tools/servicenow";
import { sanitizeModelConfig } from "../model-capabilities";
import { getBusinessContextService } from "./business-context-service";
import { selectLanguageModel } from "../model-provider";

export interface CaseGuidance {
  suggestions: string[];
  similarCasesSummary: string;
  nextSteps: string[];
}

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

  if (!problemDescription || problemDescription.length < 10) {
    // Too vague to search (lowered from 20 to 10 to catch more cases)
    console.log(`[Intelligent Assistant] Description too short for search: "${problemDescription}" (${problemDescription.length} chars)`);
    return null;
  }

  // Search for similar historical cases
  console.log(`[Intelligent Assistant] Calling Azure Search with query: "${problemDescription.substring(0, 80)}..."`);

  const similarCases = await searchService.searchSimilarCases(problemDescription, {
    topK: 3,
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

  const basePrompt = `You are a Service Desk AI assistant helping an agent troubleshoot a case.

**Current Case:**
${currentProblem}

**Similar Historical Cases:**
${similarCasesContext}

**Your Task:**
Provide concise, actionable guidance in Slack markdown format:

*Similar Cases Found:*
- Brief summary of 2-3 similar cases (case number + what fixed it)

*Suggestions:*
- 2-4 specific troubleshooting steps based on patterns from similar cases
- Keep each suggestion to 1 line, ≤80 characters

*Next Steps:*
- 1-2 recommended actions to try first

IMPORTANT:
- Be concise - max 200 words total
- Focus on ACTIONABLE steps, not theory
- Use bullet points with • or -
- No preamble like "Based on similar cases..."
- Start directly with "*Similar Cases Found:*"`;

  try {
    // Enhance prompt with business context
    const businessContextService = getBusinessContextService();
    const enhancedPrompt = await businessContextService.enhancePromptWithContext(
      basePrompt,
      channelName,
      channelTopic,
      channelPurpose
    );

    const modelSelection = selectLanguageModel({ openAiModel: "gpt-5-mini" });

    const generationConfig = sanitizeModelConfig(modelSelection.modelId, {
      model: modelSelection.model,
      prompt: enhancedPrompt,
    });

    const { text } = await generateText(generationConfig);

    return text.trim();
  } catch (error) {
    console.error("[Intelligent Assistant] Error synthesizing guidance:", error);

    // Fallback: simple list of similar cases
    const fallback = `*Similar Cases Found:*\n${similarCases
      .map((c) => `• ${c.case_number} - ${c.content.substring(0, 80)}...`)
      .join("\n")}`;

    return fallback;
  }
}
