/**
 * Case Escalation Service
 * Handles automatic escalation of non-BAU cases to Slack channels
 *
 * Triggered when case classification detects:
 * - Project scope work (not standard BAU support)
 * - Executive visibility (high-impact, C-level)
 * - Compliance impact (HIPAA, PII, regulatory)
 * - Financial impact (billing, revenue)
 *
 * Escalation flow:
 * 1. Check if escalation is needed (rule-based decision)
 * 2. Check for duplicate/recent escalations
 * 3. Determine target Slack channel
 * 4. Generate contextual message (LLM-powered or fallback template)
 * 5. Post to Slack with interactive buttons
 * 6. Record escalation in database
 */

import { config } from "../config";
import { getEscalationChannel } from "../config/escalation-channels";
import { getEscalationRepository } from "../db/repositories/escalation-repository";
import { buildEscalationMessage, buildFallbackEscalationMessage } from "./escalation-message-builder";
import { calculateBusinessIntelligenceScore } from "./business-intelligence";
import { getSlackClient } from "../slack/client";

const client = getSlackClient();
import type { CaseClassificationResult } from "../schemas/servicenow-webhook";
import type { NewCaseEscalation } from "../db/schema";

export interface EscalationContext {
  caseNumber: string;
  caseSysId: string;
  classification: CaseClassificationResult;
  // Original case data fields (not included in classification result)
  caseData: {
    short_description: string;
    description?: string;
    priority?: string;
    urgency?: string;
    state?: string;
  };
  assignedTo?: string;
  assignmentGroup?: string;
  companyName?: string;
}

export interface EscalationDecision {
  shouldEscalate: boolean;
  reason?: string;
  biScore?: number;
  triggerFlags: {
    project_scope_detected?: boolean;
    executive_visibility?: boolean;
    compliance_impact?: boolean;
    financial_impact?: boolean;
  };
}

export class EscalationService {
  private repository = getEscalationRepository();

  /**
   * Main entry point: Check if case needs escalation and handle it
   *
   * Called from case-triage.ts after classification is complete
   */
  async checkAndEscalate(context: EscalationContext): Promise<boolean> {
    if (!config.escalationEnabled) {
      console.log("[Escalation Service] Escalation disabled via config - skipping");
      return false;
    }

    console.log(`[Escalation Service] Evaluating escalation for ${context.caseNumber}`);

    // Step 1: Decide if escalation is needed (rule-based)
    const decision = this.shouldEscalate(context.classification);

    if (!decision.shouldEscalate) {
      console.log(
        `[Escalation Service] No escalation needed for ${context.caseNumber} - ` +
          `BI score ${decision.biScore || 0} below threshold ${config.escalationBiScoreThreshold}`
      );
      return false;
    }

    console.log(
      `[Escalation Service] Escalation triggered for ${context.caseNumber}: ${decision.reason} ` +
        `(BI score: ${decision.biScore})`
    );

    // Step 2: Check for duplicate/recent escalations (prevent spam)
    const hasRecent = await this.repository.hasRecentActiveEscalation(
      context.caseNumber,
      24 // Within 24 hours
    );

    if (hasRecent) {
      console.log(
        `[Escalation Service] Skipping escalation for ${context.caseNumber} - ` +
          `recent active escalation already exists`
      );
      return false;
    }

    // Step 3: Determine target Slack channel
    const channel = this.getTargetChannel(
      context.companyName,
      context.classification.category,
      context.assignmentGroup
    );

    console.log(`[Escalation Service] Target channel: ${channel}`);

    // Step 4: Generate escalation message (LLM-powered or fallback)
    let message: any; // Slack blocks
    let llmGenerated = false;
    let tokenUsage = 0;

    try {
      if (config.escalationUseLlmMessages) {
        const llmResult = await buildEscalationMessage(context, decision);
        message = llmResult.blocks;
        llmGenerated = true;
        tokenUsage = llmResult.tokenUsage || 0;
      } else {
        // Use template-based fallback
        message = buildFallbackEscalationMessage(context, decision);
      }
    } catch (error) {
      console.error("[Escalation Service] Error building escalation message:", error);
      // Fall back to template if LLM fails
      message = buildFallbackEscalationMessage(context, decision);
      llmGenerated = false;
    }

    // Step 5: Post to Slack with interactive buttons
    try {
      const result = await client.chat.postMessage({
        channel,
        blocks: message,
        text: `⚠️ Non-BAU Case Detected: ${context.caseNumber} - ${decision.reason}`,
        unfurl_links: false,
      });

      if (!result.ok || !result.ts) {
        throw new Error(`Slack API error: ${result.error || "unknown"}`);
      }

      console.log(
        `[Escalation Service] Posted escalation for ${context.caseNumber} to ${channel} (ts: ${result.ts})`
      );

      // Step 6: Record escalation in database
      const escalationRecord: NewCaseEscalation = {
        caseNumber: context.caseNumber,
        caseSysId: context.caseSysId,
        escalationReason: decision.reason || "business_intelligence_threshold",
        businessIntelligenceScore: decision.biScore,
        triggerFlags: decision.triggerFlags,
        slackChannel: channel,
        slackMessageTs: result.ts,
        // slackThreadTs is not applicable for top-level messages, only for thread replies
        assignedTo: context.assignedTo,
        assignmentGroup: context.assignmentGroup,
        companyName: context.companyName,
        category: context.classification.category,
        subcategory: context.classification.subcategory,
        priority: context.caseData.priority,
        urgency: context.caseData.urgency,
        llmGenerated,
        tokenUsage,
      };

      await this.repository.createEscalation(escalationRecord);

      console.log(
        `[Escalation Service] Successfully escalated ${context.caseNumber} to ${channel}`
      );
      return true;
    } catch (error) {
      console.error(
        `[Escalation Service] Failed to post escalation for ${context.caseNumber}:`,
        error
      );
      return false;
    }
  }

  /**
   * Determine if escalation is needed (rule-based decision)
   *
   * Triggers:
   * - project_scope_detected = true
   * - executive_visibility = true
   * - compliance_impact = true
   * - financial_impact = true
   * - business_intelligence_score >= threshold
   */
  shouldEscalate(classification: CaseClassificationResult): EscalationDecision {
    const bi = classification.business_intelligence;
    const triggerFlags: EscalationDecision["triggerFlags"] = {};

    if (!bi) {
      return {
        shouldEscalate: false,
        triggerFlags,
      };
    }

    // Check individual trigger flags (handle optional booleans with defaults)
    const triggers: Array<{ key: string; flag: boolean; weight: number }> = [
      {
        key: "project_scope_detected",
        flag: bi.project_scope_detected ?? false,
        weight: 30,
      },
      {
        key: "executive_visibility",
        flag: bi.executive_visibility ?? false,
        weight: 30,
      },
      {
        key: "compliance_impact",
        flag: bi.compliance_impact ?? false,
        weight: 25,
      },
      {
        key: "financial_impact",
        flag: bi.financial_impact ?? false,
        weight: 25,
      },
    ];

    // Check if any high-priority trigger is active
    let reason: string | undefined;
    for (const trigger of triggers) {
      if (trigger.flag) {
        triggerFlags[trigger.key as keyof EscalationDecision["triggerFlags"]] = true;
        if (!reason || trigger.weight >= 30) {
          // Use highest weight reason
          reason = trigger.key;
        }
      }
    }

    // Calculate business intelligence score
    const biScore = calculateBusinessIntelligenceScore(bi);

    // Escalate if:
    // 1. Any high-priority flag is true (project scope or executive visibility)
    // 2. OR BI score exceeds threshold
    const shouldEscalate =
      (bi.project_scope_detected ?? false) ||
      (bi.executive_visibility ?? false) ||
      (bi.compliance_impact ?? false) ||
      (bi.financial_impact ?? false) ||
      biScore >= config.escalationBiScoreThreshold;

    if (!reason && shouldEscalate) {
      reason = "business_intelligence_threshold";
    }

    return {
      shouldEscalate,
      reason,
      biScore,
      triggerFlags,
    };
  }

  /**
   * Get target Slack channel for escalation
   * Uses channel routing rules from config/escalation-channels.ts
   */
  private getTargetChannel(
    client?: string,
    category?: string,
    assignmentGroup?: string
  ): string {
    const channel = getEscalationChannel(client, category, assignmentGroup);

    // Fallback to config default if no rule matched
    if (!channel) {
      console.warn(
        `[Escalation Service] No channel rule matched - using default: ${config.escalationDefaultChannel}`
      );
      return config.escalationDefaultChannel;
    }

    return channel;
  }

  /**
   * Handle acknowledgment from Slack button press
   * Called from api/events.ts when user clicks button
   */
  async handleAcknowledgment(
    slackChannel: string,
    slackMessageTs: string,
    userId: string,
    action: string
  ): Promise<void> {
    // Find escalation by message timestamp
    const escalation = await this.repository.getEscalationByMessageTs(
      slackChannel,
      slackMessageTs
    );

    if (!escalation) {
      console.warn(
        `[Escalation Service] No escalation found for message ts ${slackMessageTs} in ${slackChannel}`
      );
      return;
    }

    // Acknowledge the escalation
    await this.repository.acknowledgeEscalation(escalation.id, userId, action);

    console.log(
      `[Escalation Service] Escalation ${escalation.id} acknowledged by ${userId} (action: ${action})`
    );

    // TODO: Handle specific actions (create_project, reassign, etc.)
    // This will be implemented when we add the interactive buttons in events.ts
  }
}

// Singleton instance
let serviceInstance: EscalationService | null = null;

export function getEscalationService(): EscalationService {
  if (!serviceInstance) {
    serviceInstance = new EscalationService();
  }
  return serviceInstance;
}
