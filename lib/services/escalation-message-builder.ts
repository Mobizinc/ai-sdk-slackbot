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

import { z } from "zod";
import { getLlmTimeout, getServiceNowConfig, getEscalationNotifyAssignedEngineer } from "../config/helpers";
import { withTimeout, isTimeoutError } from "../utils/timeout-wrapper";
import { AnthropicChatService } from "./anthropic-chat";
import type { EscalationContext, EscalationDecision } from "./escalation-service";
import {
  createHeaderBlock,
  createSectionBlock,
  createFieldsBlock,
  createDivider,
  createContextBlock,
  createButton,
  sanitizeMrkdwn,
  sanitizePlainText,
  getUrgencyIndicator,
  validateBlockCount,
  validateFieldsArray,
  MessageEmojis,
  type KnownBlock,
} from "../utils/message-styling";

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
    const chatService = AnthropicChatService.getInstance();
    const response = await withTimeout(
      chatService.send({
        messages: [
          {
            role: "system",
            content:
              "You are a service desk escalation analyst. Respond with concise JSON by calling the `draft_escalation_content` tool exactly once.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        tools: [
          {
            name: "draft_escalation_content",
            description:
              "Generate escalation summary and clarifying questions. Call exactly once with structured output.",
            inputSchema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                questions: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 4,
                },
              },
              required: ["summary", "questions"],
              additionalProperties: false,
            },
          },
        ],
        maxSteps: 3,
      }),
      getLlmTimeout("escalation"),
    );

    let content: { summary: string; questions: string[] } | null = null;

    if (response.toolCalls.length > 0) {
      const firstCall = response.toolCalls[0];
      content = EscalationContentSchema.parse(firstCall.input);
    } else if (response.outputText) {
      try {
        const parsed = JSON.parse(response.outputText);
        content = EscalationContentSchema.parse(parsed);
      } catch (parseError) {
        console.warn(
          "[Escalation Message Builder] Failed to parse Anthropic text output:",
          parseError,
        );
      }
    }

    if (!content) {
      throw new Error("Structured escalation content not returned from Anthropic");
    }

    const blocks = buildSlackBlocks(context, decision, content);

    const usage =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    console.log(
      `[Escalation Message Builder] Generated LLM message (${usage} tokens)`
    );

    return {
      blocks,
      tokenUsage: usage,
    };
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error(
        `[Escalation Message Builder] LLM timeout after ${error.timeoutMs}ms - using fallback`
      );
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
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Header - sanitize case number to prevent injection
  const sanitizedCaseNumber = sanitizePlainText(context.caseNumber, 100);
  blocks.push(
    createHeaderBlock(`${MessageEmojis.WARNING} Non-BAU Case Detected: ${sanitizedCaseNumber}`)
  );

  // Business Context Section
  const businessContextFields: Array<{ label: string; value: string }> = [];

  if (context.companyName) {
    businessContextFields.push({
      label: "Client",
      value: sanitizeMrkdwn(context.companyName),
    });
  } else if (context.classification.scope_evaluation?.clientName) {
    businessContextFields.push({
      label: "Client",
      value: sanitizeMrkdwn(context.classification.scope_evaluation.clientName),
    });
  } else {
    const bi = context.classification.business_intelligence as { clientName?: string; client_name?: string } | undefined;
    const biClient = bi?.clientName || bi?.client_name;
    if (biClient) {
      businessContextFields.push({
        label: "Client",
        value: sanitizeMrkdwn(biClient),
      });
    }
  }

  const requestSummary = context.caseData.short_description || context.caseData.description;
  if (requestSummary) {
    businessContextFields.push({
      label: "Request",
      value: sanitizeMrkdwn(requestSummary),
    });
  }

  if (context.contactName) {
    businessContextFields.push({
      label: "Contact",
      value: sanitizeMrkdwn(context.contactName),
    });
  }

  if (context.assignedTo && getEscalationNotifyAssignedEngineer()) {
    businessContextFields.push({
      label: "Assigned",
      value: `<@${context.assignedTo}>`, // Slack user mentions are safe
    });
  } else if (context.assignmentGroup) {
    businessContextFields.push({
      label: "Group",
      value: sanitizeMrkdwn(context.assignmentGroup),
    });
  }

  if (businessContextFields.length > 0) {
    // Validate fields don't exceed limit
    validateFieldsArray(businessContextFields);

    blocks.push(
      createSectionBlock("*━━━ BUSINESS CONTEXT ━━━*"),
      createFieldsBlock(businessContextFields)
    );
  }

  const contractBlocks = buildContractGuardrailBlocks(context);
  if (contractBlocks.length > 0) {
    blocks.push(...contractBlocks);
  }

  // AI Analysis Section
  const categoryText = sanitizeMrkdwn(context.classification.category || "Unknown");
  const subcategoryText = context.classification.subcategory
    ? ` > ${sanitizeMrkdwn(context.classification.subcategory)}`
    : "";
  const confidence = Math.round((context.classification.confidence_score || 0) * 100);
  const urgencyIcon = getUrgencyIndicator(
    context.caseData.urgency || context.classification.urgency_level
  );

  let analysisText = `*Category:* ${categoryText}${subcategoryText} | ${urgencyIcon} | ${confidence}% confidence\n\n`;

  if (content?.summary) {
    // Sanitize LLM-generated summary
    analysisText += sanitizeMrkdwn(content.summary);
  } else {
    // Fallback: Use business intelligence reasons (sanitize ServiceNow data)
    const bi = context.classification.business_intelligence;
    if (bi?.project_scope_reason) {
      analysisText += sanitizeMrkdwn(bi.project_scope_reason);
    } else if (bi?.executive_visibility_reason) {
      analysisText += sanitizeMrkdwn(bi.executive_visibility_reason);
    } else {
      analysisText += `This case requires attention beyond standard BAU support (BI Score: ${decision.biScore}/100)`;
    }
  }

  blocks.push(
    createSectionBlock("*━━━ AI ANALYSIS ━━━*"),
    createSectionBlock(analysisText)
  );

  // Recommended Actions Section (Questions)
  if (content?.questions && content.questions.length > 0) {
    // Sanitize LLM-generated questions
    const questionsText = content.questions
      .map((q) => `${MessageEmojis.QUESTION} ${sanitizeMrkdwn(q)}`)
      .join("\n");

    blocks.push(
      createSectionBlock("*━━━ RECOMMENDED ACTIONS ━━━*"),
      createSectionBlock(questionsText)
    );
  } else if (context.classification.immediate_next_steps) {
    // Fallback: Use immediate_next_steps from classification (sanitize)
    const stepsText = context.classification.immediate_next_steps
      .slice(0, 3)
      .map((step: string) => `• ${sanitizeMrkdwn(step)}`)
      .join("\n");

    blocks.push(
      createSectionBlock("*━━━ RECOMMENDED ACTIONS ━━━*"),
      createSectionBlock(stepsText)
    );
  }

  // Interactive Action Buttons
  blocks.push({
    type: "actions",
    block_id: "escalation_actions_primary",
    elements: [
      createButton({
        text: "Create Project",
        actionId: "escalation_button_create_project",
        value: `create_project:${sanitizedCaseNumber}`,
        style: "primary",
      }),
      createButton({
        text: "Acknowledge as BAU",
        actionId: "escalation_button_acknowledge_bau",
        value: `acknowledge_bau:${sanitizedCaseNumber}`,
      }),
      createButton({
        text: "Reassign",
        actionId: "escalation_button_reassign",
        value: `reassign:${sanitizedCaseNumber}`,
      }),
      createButton({
        text: "View in ServiceNow",
        actionId: "escalation_button_view_servicenow",
        url: getServiceNowUrl(context.caseSysId),
      }),
    ],
  });

  // Divider
  blocks.push(createDivider());

  // Footer with metadata
  blocks.push(
    createContextBlock(
      `${MessageEmojis.PROCESSING} Escalation triggered by AI triage | Case: ${sanitizedCaseNumber} | BI Score: ${decision.biScore}/100`
    )
  );

  // Validate block count before returning
  validateBlockCount(blocks, 'message');

  return blocks;
}

function buildContractGuardrailBlocks(context: EscalationContext): KnownBlock[] {
  const scopeAnalysis = context.classification.scope_analysis;
  const scopeEvaluation = context.classification.scope_evaluation;

  if (!scopeAnalysis && !scopeEvaluation) {
    return [];
  }

  const lines: string[] = [];
  const recordType = context.classification.record_type_suggestion?.type;

  if (typeof scopeAnalysis?.estimated_effort_hours === "number") {
    const rounded = Math.round(scopeAnalysis.estimated_effort_hours * 10) / 10;
    let capText = "";
    const thresholds = scopeEvaluation?.policyEffortThresholds;
    if (thresholds) {
      if (
        (recordType === "Incident" || recordType === "Problem") &&
        typeof thresholds.incidentHours === "number"
      ) {
        capText = ` (cap ${thresholds.incidentHours}h incident)`;
      } else if (
        (recordType === "Case" || recordType === "Change" || !recordType) &&
        typeof thresholds.serviceRequestHours === "number"
      ) {
        capText = ` (cap ${thresholds.serviceRequestHours}h request)`;
      }
    }
    lines.push(`• Estimated effort: ${rounded}h${capText}`);
  }

  if (scopeAnalysis?.requires_onsite_support) {
    const onsite = typeof scopeAnalysis.onsite_hours_estimate === "number"
      ? `${Math.round(scopeAnalysis.onsite_hours_estimate * 10) / 10}h`
      : "Yes";
    const included = scopeEvaluation?.policyOnsiteSupport?.includedHoursPerMonth;
    const onsiteCap = typeof included === "number" ? ` (monthly cap ${included}h)` : "";
    lines.push(`• Onsite requirement: ${onsite}${onsiteCap}`);
  }

  if (scopeAnalysis?.contract_flags && scopeAnalysis.contract_flags.length > 0) {
    lines.push(`• Contract flags: ${scopeAnalysis.contract_flags.map((flag) => flag.replace(/_/g, " ")).join(", ")}`);
  }

  if (scopeEvaluation?.reasons && scopeEvaluation.reasons.length > 0) {
    scopeEvaluation.reasons.forEach((reason) => {
      lines.push(`• ${reason}`);
    });
  } else if (scopeAnalysis?.reasoning) {
    lines.push(`• ${scopeAnalysis.reasoning}`);
  }

  if (lines.length === 0) {
    return [];
  }

  const text = lines.map((line) => sanitizeMrkdwn(line)).join("\n");
  return [
    createSectionBlock("*━━━ CONTRACT GUARDRAILS ━━━*"),
    createSectionBlock(text),
  ];
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
 * Get ServiceNow case URL
 */
function getServiceNowUrl(caseSysId: string): string {
  const snConfig = getServiceNowConfig();
  const instance = (snConfig.instanceUrl || "https://your-instance.service-now.com").replace(/\/$/, "");
  return `${instance}/sn_customerservice_case.do?sys_id=${caseSysId}`;
}
