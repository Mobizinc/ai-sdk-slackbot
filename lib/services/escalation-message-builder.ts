/**
 * Escalation Message Builder
 * Generates Slack Block Kit messages for case escalations
 *
 * Features:
 * - LLM-generated contextual summaries and questions
 * - Interactive action buttons (Create Project, Acknowledge BAU, Reassign)
 * - Fallback template if LLM unavailable
 * - Mentions assigned engineer if configured
 */

import { generateObject } from "../instrumented-ai";
import { z } from "zod";
import { modelProvider } from "../model-provider";
import { config } from "../config";
import { withTimeout, isTimeoutError } from "../utils/timeout-wrapper";
import type { EscalationContext, EscalationDecision } from "./escalation-service";

/**
 * Schema for LLM-generated escalation content
 */
const EscalationContentSchema = z.object({
  summary: z.string().describe(
    "Brief 1-2 sentence summary of why this case requires escalation beyond normal BAU support"
  ),
  questions: z.array(z.string()).min(2).max(4).describe(
    "2-4 specific clarifying questions to help scope the non-BAU work. Focus on what, where, when, how many."
  ),
});

/**
 * Build escalation message using LLM for contextual content
 */
export async function buildEscalationMessage(
  context: EscalationContext,
  decision: EscalationDecision
): Promise<{ blocks: any[]; tokenUsage?: number }> {
  console.log(`[Escalation Message Builder] Generating LLM message for ${context.caseNumber}`);

  const prompt = buildEscalationPrompt(context, decision);

  try {
    // Wrap LLM call with timeout
    const result = await withTimeout(
      generateObject({
        model: modelProvider.languageModel("chat-model"),
        schema: EscalationContentSchema as any, // Type assertion to avoid deep instantiation error
        prompt: prompt,
      }),
      config.llmEscalationTimeoutMs,
      // Fallback to template-based message on timeout
      async () => {
        console.warn(
          `[Escalation Message Builder] LLM timeout (${config.llmEscalationTimeoutMs}ms) - using fallback template`
        );
        const fallbackBlocks = buildFallbackEscalationMessage(context, decision);
        return {
          object: getFallbackContent(context),
          usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 },
        } as any;
      }
    );

    const content = result.object as { summary: string; questions: string[] };
    const blocks = buildSlackBlocks(context, decision, content);

    console.log(
      `[Escalation Message Builder] Generated LLM message (${result.usage.totalTokens} tokens)`
    );

    return {
      blocks,
      tokenUsage: result.usage.totalTokens,
    };
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error(
        `[Escalation Message Builder] LLM timeout after ${error.timeoutMs}ms - using fallback`
      );
      // Return fallback template
      const fallbackBlocks = buildFallbackEscalationMessage(context, decision);
      return {
        blocks: fallbackBlocks,
        tokenUsage: 0,
      };
    }

    console.error("[Escalation Message Builder] LLM generation failed:", error);
    throw error;
  }
}

/**
 * Build prompt for LLM to generate escalation content
 */
function buildEscalationPrompt(
  context: EscalationContext,
  decision: EscalationDecision
): string {
  const bi = context.classification.business_intelligence;
  const reasonDetails: string[] = [];

  // Add context about why escalation was triggered
  if (bi?.project_scope_detected) {
    reasonDetails.push(`- PROJECT SCOPE: ${bi.project_scope_reason || "Detected"}`);
  }
  if (bi?.executive_visibility) {
    reasonDetails.push(`- EXECUTIVE VISIBILITY: ${bi.executive_visibility_reason || "Detected"}`);
  }
  if (bi?.compliance_impact) {
    reasonDetails.push(`- COMPLIANCE IMPACT: ${bi.compliance_impact_reason || "Detected"}`);
  }
  if (bi?.financial_impact) {
    reasonDetails.push(`- FINANCIAL IMPACT: ${bi.financial_impact_reason || "Detected"}`);
  }

  return `You are a service desk escalation analyst. A case has been flagged as non-BAU (not Business As Usual) work that may require:
- Professional services engagement
- Project management
- Executive coordination
- Specialized expertise

CASE DETAILS:
Case Number: ${context.caseNumber}
Company: ${context.companyName || "Unknown"}
Short Description: ${context.caseData.short_description}
Description: ${context.caseData.description || "N/A"}
Category: ${context.classification.category || "Unknown"}
Priority: ${context.caseData.priority || "Unknown"}

ESCALATION TRIGGERS:
${reasonDetails.join("\n")}

Business Intelligence Score: ${decision.biScore}/100

NEXT STEPS FROM AI ANALYSIS:
${context.classification.immediate_next_steps?.join("\n") || "None provided"}

TASK:
Generate a concise escalation summary and 2-4 specific clarifying questions to help the team understand the scope of this non-BAU work. Questions should focus on:
- Scale/scope (how many locations, users, systems?)
- Timeline expectations (when is this needed?)
- Dependencies (what needs to be in place first?)
- Resources (who else needs to be involved?)

Be specific to this case based on the description and triggers.`;
}

/**
 * Build Slack Block Kit message structure
 */
function buildSlackBlocks(
  context: EscalationContext,
  decision: EscalationDecision,
  content?: { summary: string; questions: string[] }
): any[] {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `⚠️ Non-BAU Case Detected: ${context.caseNumber}`,
      emoji: true,
    },
  });

  // Business Context Section
  const businessContextFields: any[] = [];

  if (context.companyName) {
    businessContextFields.push({
      type: "mrkdwn",
      text: `*Client:*\n${context.companyName}`,
    });
  }

  if (context.assignedTo && config.escalationNotifyAssignedEngineer) {
    businessContextFields.push({
      type: "mrkdwn",
      text: `*Assigned:*\n<@${context.assignedTo}>`,
    });
  } else if (context.assignmentGroup) {
    businessContextFields.push({
      type: "mrkdwn",
      text: `*Group:*\n${context.assignmentGroup}`,
    });
  }

  if (businessContextFields.length > 0) {
    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*━━━ BUSINESS CONTEXT ━━━*",
        },
      },
      {
        type: "section",
        fields: businessContextFields,
      }
    );
  }

  // AI Analysis Section
  const categoryText = context.classification.category || "Unknown";
  const subcategoryText = context.classification.subcategory
    ? ` > ${context.classification.subcategory}`
    : "";
  const confidence = Math.round((context.classification.confidence_score || 0) * 100);
  const urgencyIcon = getUrgencyIcon(context.caseData.urgency || context.classification.urgency_level);

  let analysisText = `*Category:* ${categoryText}${subcategoryText} | ${urgencyIcon} ${context.caseData.urgency || context.classification.urgency_level || "Unknown"} | ${confidence}% confidence\n\n`;

  if (content?.summary) {
    analysisText += `${content.summary}`;
  } else {
    // Fallback: Use business intelligence reasons
    const bi = context.classification.business_intelligence;
    if (bi?.project_scope_reason) {
      analysisText += bi.project_scope_reason;
    } else if (bi?.executive_visibility_reason) {
      analysisText += bi.executive_visibility_reason;
    } else {
      analysisText += `This case requires attention beyond standard BAU support (BI Score: ${decision.biScore}/100)`;
    }
  }

  blocks.push(
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*━━━ AI ANALYSIS ━━━*",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: analysisText,
      },
    }
  );

  // Recommended Actions Section (Questions)
  if (content?.questions && content.questions.length > 0) {
    const questionsText = content.questions
      .map((q) => `❓ ${q}`)
      .join("\n");

    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*━━━ RECOMMENDED ACTIONS ━━━*",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: questionsText,
        },
      }
    );
  } else if (context.classification.immediate_next_steps) {
    // Fallback: Use immediate_next_steps from classification
    const stepsText = context.classification.immediate_next_steps
      .slice(0, 3)
      .map((step: string) => `• ${step}`)
      .join("\n");

    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*━━━ RECOMMENDED ACTIONS ━━━*",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: stepsText,
        },
      }
    );
  }

  // Interactive Action Buttons
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Create Project",
          emoji: true,
        },
        style: "primary",
        value: `create_project:${context.caseNumber}`,
        action_id: "escalation_create_project",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Acknowledge as BAU",
          emoji: true,
        },
        value: `acknowledge_bau:${context.caseNumber}`,
        action_id: "escalation_acknowledge_bau",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Reassign",
          emoji: true,
        },
        value: `reassign:${context.caseNumber}`,
        action_id: "escalation_reassign",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "View in ServiceNow",
          emoji: true,
        },
        url: getServiceNowUrl(context.caseSysId),
        action_id: "escalation_view_servicenow",
      },
    ],
  });

  // Divider
  blocks.push({
    type: "divider",
  });

  // Footer with metadata
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `🤖 Escalation triggered by AI triage | Case: ${context.caseNumber} | BI Score: ${decision.biScore}/100`,
      },
    ],
  });

  return blocks;
}

/**
 * Build fallback escalation message (no LLM)
 * Used when LLM is disabled or fails
 */
export function buildFallbackEscalationMessage(
  context: EscalationContext,
  decision: EscalationDecision
): any[] {
  console.log(`[Escalation Message Builder] Using fallback template for ${context.caseNumber}`);

  // Use standard blocks but with simpler content
  const simplifiedContent = {
    summary: getFallbackSummary(context, decision),
    questions: getFallbackQuestions(context),
  };

  return buildSlackBlocks(context, decision, simplifiedContent);
}

/**
 * Get fallback summary when LLM unavailable
 */
function getFallbackSummary(
  context: EscalationContext,
  decision: EscalationDecision
): string {
  const bi = context.classification.business_intelligence;

  if (bi?.project_scope_reason) {
    return bi.project_scope_reason;
  }
  if (bi?.executive_visibility_reason) {
    return bi.executive_visibility_reason;
  }
  if (bi?.compliance_impact_reason) {
    return bi.compliance_impact_reason;
  }
  if (bi?.financial_impact_reason) {
    return bi.financial_impact_reason;
  }

  return `This case requires attention beyond standard BAU support. Business Intelligence Score: ${decision.biScore}/100`;
}

/**
 * Get fallback questions when LLM unavailable
 */
function getFallbackQuestions(context: EscalationContext): string[] {
  const questions: string[] = [];

  // Use immediate_next_steps from classification if available
  if (context.classification.immediate_next_steps && context.classification.immediate_next_steps.length > 0) {
    return context.classification.immediate_next_steps.slice(0, 4);
  }

  // Generic fallback questions
  questions.push(
    "What is the scope of this request (number of locations, users, systems)?",
    "What is the timeline and urgency for this work?",
    "Are there any dependencies or prerequisites that need to be addressed first?",
    "Who else needs to be involved from the client or our team?"
  );

  return questions;
}

/**
 * Get fallback content for timeout scenarios
 */
function getFallbackContent(context: EscalationContext): { summary: string; questions: string[] } {
  return {
    summary: getFallbackSummary(context, { shouldEscalate: true, biScore: 0, triggerFlags: {} }),
    questions: getFallbackQuestions(context),
  };
}

/**
 * Get urgency icon emoji
 */
function getUrgencyIcon(urgency?: string): string {
  if (!urgency) return "🟡";

  const urgencyLower = urgency.toLowerCase();
  if (urgencyLower.includes("high") || urgencyLower === "1") {
    return "🔴";
  }
  if (urgencyLower.includes("medium") || urgencyLower === "2") {
    return "🟡";
  }
  return "🟢";
}

/**
 * Get ServiceNow case URL
 */
function getServiceNowUrl(caseSysId: string): string {
  const instance = process.env.SERVICENOW_INSTANCE_URL || "https://your-instance.service-now.com";
  return `${instance}/sn_customerservice_case.do?sys_id=${caseSysId}`;
}
