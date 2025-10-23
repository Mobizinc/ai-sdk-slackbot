/**
 * Interactive KB Assistant - Uses gpt-5 to generate contextual questions
 * and gather missing information for KB article creation.
 */

import type { QualityAssessment } from "./case-quality-analyzer";
import type { CaseContext } from "../context-manager";
import { getFeatureFlags } from "../config/feature-flags";
import { AnthropicChatService } from "./anthropic-chat";

export interface GatheringQuestions {
  questions: string[];
  tone: "friendly" | "professional" | "urgent";
  context: string; // Why we're asking
}

/**
 * Generate contextual questions to gather missing information
 */
export async function generateGatheringQuestions(
  assessment: QualityAssessment,
  context: CaseContext,
  caseNumber: string
): Promise<GatheringQuestions> {
  const flags = getFeatureFlags();
  const conversationSummary = context.messages
    .slice(-5) // Last 5 messages for context
    .map((msg) => `${msg.user}: ${msg.text}`)
    .join("\n");

  const prompt = `You are a friendly knowledge management assistant helping to create a KB article for case ${caseNumber}.

**What we know so far:**
${conversationSummary}

**Quality Assessment:**
- Problem Clarity: ${assessment.problemClarity}
- Solution Clarity: ${assessment.solutionClarity}
- Steps Documented: ${assessment.stepsDocumented ? "Yes" : "No"}
- Root Cause Identified: ${assessment.rootCauseIdentified ? "Yes" : "No"}
- Missing Information: ${assessment.missingInfo.join(", ")}

**Your Task:**
Generate 2-4 specific, contextual questions to gather the missing information. Questions should be:
- Friendly and appreciative of their work
- Specific to this case (not generic)
- Focused on what's actually missing
- Easy to answer quickly

**Question Types:**
- If problem vague: Ask about symptoms, error messages, user impact
- If solution vague: Ask about specific steps taken, tools used
- If no root cause: Ask what caused the issue
- If no steps: Ask for step-by-step instructions

Return ONLY valid JSON:
{
  "questions": [<array of 2-4 question strings>],
  "tone": "friendly",
  "context": "<one sentence explaining why we need this info>"
}

Example:
{
  "questions": [
    "What was the root cause of the Foxit crash?",
    "What specific steps did you take to resolve it?",
    "Should users try this themselves or escalate to support?"
  ],
  "tone": "friendly",
  "context": "This will help the team handle similar issues faster"
}`;

  try {
    console.log("[KB Assistant] Generating gathering questions...");

    if (flags.refactorEnabled) {
      const chatService = AnthropicChatService.getInstance();
      const response = await chatService.send({
        messages: [
          {
            role: "system",
            content:
              "You are a friendly knowledge management assistant helping to create a KB article. Respond with concise JSON answers only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const output = response.outputText ?? extractText(response.message);

      if (!output) {
        throw new Error("Anthropic did not return gathering questions");
      }

      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in Anthropic response");
      }

      const result = JSON.parse(jsonMatch[0]) as GatheringQuestions;

      console.log(`[KB Assistant] Generated ${result.questions.length} questions`);

      return result;
    }

    // Refactor not enabled - throw error
    throw new Error("AnthropicChatService not available - refactor flag disabled");
  } catch (error) {
    console.error("[KB Assistant] Error generating questions:", error);

    // Fallback to generic questions based on missing info
    const fallbackQuestions: string[] = [];

    if (assessment.missingInfo.includes("root cause") || !assessment.rootCauseIdentified) {
      fallbackQuestions.push("What caused this issue?");
    }
    if (assessment.missingInfo.includes("steps") || !assessment.stepsDocumented) {
      fallbackQuestions.push("What steps did you take to resolve it?");
    }
    if (assessment.solutionClarity !== "clear") {
      fallbackQuestions.push("How exactly did you fix this?");
    }

    return {
      questions: fallbackQuestions.length > 0
        ? fallbackQuestions
        : ["Can you provide more details about how you resolved this?"],
      tone: "friendly",
      context: "This will help create a helpful KB article for the team",
    };
  }
}

function extractText(message: any): string | undefined {
  if (!message?.content) return undefined;
  const blocks = Array.isArray(message.content) ? message.content : [message.content];
  const text = blocks
    .filter((block: any) => block?.type === "text")
    .map((block: any) => block.text ?? "")
    .join("\n")
    .trim();
  return text || undefined;
}

/**
 * Format gathering message for Slack
 */
export function formatGatheringMessage(
  caseNumber: string,
  gathering: GatheringQuestions
): string {
  let message = `✅ Great work resolving *${caseNumber}*!\n\n`;
  message += `To help train the team, I'd like to create a KB article.\n`;
  message += `However, I need a bit more detail:\n\n`;

  // Add questions as numbered list
  gathering.questions.forEach((question, idx) => {
    message += `${idx + 1}. ${question}\n`;
  });

  message += `\nReply here when you have a moment! 🙏\n`;
  message += `_${gathering.context}_`;

  return message;
}

/**
 * Format follow-up message (for 2nd attempt)
 */
export function formatFollowUpMessage(
  caseNumber: string,
  stillMissing: string[]
): string {
  let message = `Thanks for the info on *${caseNumber}*!\n\n`;
  message += `Just need a couple more details:\n\n`;

  stillMissing.forEach((item, idx) => {
    message += `${idx + 1}. ${item}\n`;
  });

  message += `\nThis will really help make the KB article useful! 🙌`;

  return message;
}

/**
 * Format abandonment message (when giving up after max attempts)
 */
export function formatAbandonmentMessage(caseNumber: string): string {
  return `✅ *${caseNumber}* is resolved! 🎉\n\n_Not enough detail available for a KB article, but great work resolving the issue!_`;
}

/**
 * Format message requesting case note updates (for low quality cases)
 */
export function formatNoteRequestMessage(
  caseNumber: string,
  missingInfo: string[]
): string {
  let message = `✅ Great that *${caseNumber}* is resolved!\n\n`;
  message += `I'd love to create a KB article, but need a bit more detail in the case notes.\n\n`;
  message += `*Please add to ServiceNow:*\n`;

  missingInfo.forEach((item, idx) => {
    message += `${idx + 1}. ${item}\n`;
  });

  message += `\n_I'll check back in 24 hours. If the case notes are updated, I'll generate the KB then._ ⏰`;

  return message;
}

/**
 * Format timeout message (when user doesn't respond within 24 hours)
 */
export function formatTimeoutMessage(caseNumber: string): string {
  return `⏰ KB article request for *${caseNumber}* has timed out.\n\n_No worries! Feel free to manually create a KB if needed._`;
}
