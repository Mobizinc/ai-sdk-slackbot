import type { BusinessContextCmdbIdentifier, Workflow } from "./db/schema";
import { getBusinessContextRepository } from "./db/repositories/business-context-repository";
import { getBusinessContextService } from "./services/business-context-service";
import { getSlackMessagingService } from "./services/slack-messaging";
import { workflowManager } from "./services/workflow-manager";
import {
  createSectionBlock,
  createDivider,
  createContextBlock,
  sanitizeMrkdwn,
  sanitizePlainText,
  validateBlockCount,
  MessageEmojis,
  type KnownBlock,
} from "./utils/message-styling";

const slackMessaging = getSlackMessagingService();
const WORKFLOW_TYPE_CONTEXT_UPDATE = "CONTEXT_UPDATE_PROPOSAL";

export type ContextUpdateAction =
  | {
      type: "append_cmdb_identifier";
      identifier: BusinessContextCmdbIdentifier;
      createEntityIfMissing?: boolean;
      entityTypeIfCreate?: "CLIENT" | "VENDOR" | "PLATFORM";
    };

export interface ContextUpdateProposal {
  entityName: string;
  summary: string;
  details?: string;
  actions: ContextUpdateAction[];
  stewardMentions: string[];
  stewardChannelId: string;
  stewardChannelName?: string;
  sourceChannelId: string;
  sourceThreadTs?: string;
  initiatedBy?: string;
  caseNumber?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
}

// Corresponds to the payload in the workflow
interface ContextUpdateWorkflowPayload {
    entityName: string;
    proposedChanges: {
        summary: string;
        details?: string;
        actions: ContextUpdateAction[];
        confidence?: "LOW" | "MEDIUM" | "HIGH";
    };
    proposedBy: string;
    sourceChannelId: string;
    sourceThreadTs?: string;
    caseNumber?: string;
    stewardChannelName?: string;
    blockedAt: string;
}


function buildMentionText(targets: string[]): string {
  if (targets.length === 0) {
    return "Stewards";
  }
  return targets.join(" ");
}

function formatConfidence(confidence: ContextUpdateProposal["confidence"]):
 string {
  if (!confidence) return "Not provided";
  if (confidence === "HIGH") return "High";
  if (confidence === "MEDIUM") return "Medium";
  return "Low";
}

function formatActions(actions: ContextUpdateAction[]): string {
  if (!actions.length) return "No structured update actions were supplied.";

  const bulletItems = actions.map((action, index) => {
    if (action.type === "append_cmdb_identifier") {
      const id = action.identifier;
      // CRITICAL: Sanitize all CMDB data to prevent injection
      const label = sanitizeMrkdwn(id.ciName || id.sysId || `identifier-${index + 1}`);
      const lines: string[] = [];
      lines.push(`• *Add CMDB entry* ${label}`);
      if (id.ipAddresses?.length) {
        const sanitizedIPs = id.ipAddresses.map(ip => sanitizeMrkdwn(ip)).join(", ");
        lines.push(`  • IPs: ${sanitizedIPs}`);
      } else {
        lines.push(`  • IPs: not provided`);
      }
      if (id.ownerGroup) {
        lines.push(`  • Owner: ${sanitizeMrkdwn(id.ownerGroup)}`);
      }
      if (id.description) {
        lines.push(`  • Summary: ${sanitizeMrkdwn(id.description)}`);
      }
      if (id.documentation?.length) {
        const sanitizedDocs = id.documentation.map(doc => sanitizeMrkdwn(doc)).join("; ");
        lines.push(`  • Docs: ${sanitizedDocs}`);
      }
      return lines.join("\n");
    }
    return `• Unsupported action (${action.type})`;
  });

  return bulletItems.join("\n");
}

export class ContextUpdateManager {
  private repository = getBusinessContextRepository();

  async postProposal(proposal: ContextUpdateProposal): Promise<{ messageTs: string }> {
    if (!workflowManager) {
        throw new Error("WorkflowManager not available. Cannot post proposal.");
    }
    const stewardText = buildMentionText(proposal.stewardMentions); // User mentions are safe
    const actionsText = formatActions(proposal.actions); // Already sanitized in formatActions
    const confidenceText = formatConfidence(proposal.confidence); // Enum value, safe

    // CRITICAL: Sanitize all user-provided data
    const sanitizedEntityName = sanitizeMrkdwn(proposal.entityName);
    const sanitizedSummary = sanitizeMrkdwn(proposal.summary);
    const sanitizedDetails = proposal.details ? sanitizeMrkdwn(proposal.details) : null;
    const sanitizedCaseNumber = proposal.caseNumber ? sanitizePlainText(proposal.caseNumber, 100) : null;
    const sanitizedInitiator = proposal.initiatedBy ? sanitizeMrkdwn(proposal.initiatedBy) : null;

    const summaryBlock = sanitizedDetails
      ? `${sanitizedSummary}\n\n_${sanitizedDetails}_`
      : sanitizedSummary;

    const caseLine = sanitizedCaseNumber ? `Case: *${sanitizedCaseNumber}*` : undefined;
    const initiatorLine = sanitizedInitiator
      ? `Proposed by: *${sanitizedInitiator}*`
      : "Proposed by: *PeterPool (auto)*";

    const headerText = `*Context Update Review* — ${sanitizedEntityName}`;
    const postText = `${headerText}\n${stewardText}\n${summaryBlock}`;

    // Build blocks using design system
    const blocks: KnownBlock[] = [
      createSectionBlock(headerText),
      createSectionBlock(
        `${stewardText}\n${initiatorLine}${ 
          caseLine ? `\n${caseLine}` : "" 
        }\nConfidence: *${confidenceText}*`
      ),
      createSectionBlock(summaryBlock),
      createSectionBlock(`*Requested actions*\n${actionsText}`),
      createContextBlock("React with :white_check_mark: to apply or :x: to reject."),
    ];

    // Validate block count
    validateBlockCount(blocks, 'message');

    const result = await slackMessaging.postMessage({
      channel: proposal.stewardChannelId,
      text: postText,
      unfurlLinks: false,
      blocks,
    });

    if (!result.ts) {
      throw new Error("Failed to post context update proposal (missing timestamp)");
    }
    
    const payload: ContextUpdateWorkflowPayload = {
        entityName: proposal.entityName,
        proposedChanges: {
          summary: proposal.summary,
          details: proposal.details,
          actions: proposal.actions,
          confidence: proposal.confidence,
        },
        proposedBy: proposal.initiatedBy || 'PeterPool (auto)',
        sourceChannelId: proposal.sourceChannelId,
        sourceThreadTs: proposal.sourceThreadTs,
        caseNumber: proposal.caseNumber,
        stewardChannelName: proposal.stewardChannelName,
        blockedAt: new Date().toISOString(),
    };

    await workflowManager.start({
        workflowType: WORKFLOW_TYPE_CONTEXT_UPDATE,
        workflowReferenceId: `${proposal.stewardChannelId}:${result.ts}`,
        initialState: 'PENDING_APPROVAL',
        payload,
        expiresInSeconds: 48 * 3600,
        contextKey: `case:${proposal.caseNumber}`
    });

    console.log(
      `[Context Update Manager] Posted proposal for ${sanitizedEntityName} ` +
      `(persisted to DB with 48h expiration)`
    );

    return { messageTs: result.ts };
  }

  async handleReaction(
    channelId: string,
    messageTs: string,
    reaction: string,
    userId: string
  ): Promise<void> {
    if (!workflowManager) {
        console.warn("[Context Update Manager] WorkflowManager not available.");
        return;
    }

    const workflow = await workflowManager.findActiveByReferenceId(WORKFLOW_TYPE_CONTEXT_UPDATE, `${channelId}:${messageTs}`);

    if (!workflow || workflow.currentState !== 'PENDING_APPROVAL') {
      console.log(`[Context Update Manager] No pending update found for ${channelId}:${messageTs}`);
      return; // Not a tracked message or already processed
    }

    const isApproval =
      reaction === "+1" || reaction === "white_check_mark" || reaction === "heavy_check_mark";
    const isRejection = reaction === "-1" || reaction === "x" || reaction === "negative_squared_cross_mark";

    if (!isApproval && !isRejection) {
      return;
    }

    if (isApproval) {
      await this.applyApprovedUpdate(workflow, userId);
    } else if (isRejection) {
      await this.rejectUpdate(workflow, userId);
    }

    console.log(
      `[Context Update Manager] Processed ${isApproval ? 'approval' : 'rejection'} ` +
      `for ${(workflow.payload as ContextUpdateWorkflowPayload).entityName}`
    );
  }

  private async applyApprovedUpdate(workflow: Workflow, userId: string): Promise<void> {
    if (!workflowManager) {
        throw new Error("WorkflowManager not available.");
    }

    const payload = workflow.payload as ContextUpdateWorkflowPayload;
    const proposal: ContextUpdateProposal = {
        entityName: payload.entityName,
        summary: payload.proposedChanges.summary,
        details: payload.proposedChanges.details,
        actions: payload.proposedChanges.actions,
        confidence: payload.proposedChanges.confidence,
        stewardMentions: [], // Not needed for approval logic
        stewardChannelId: workflow.contextKey?.split(':')[1] || '',
        sourceChannelId: payload.sourceChannelId,
        sourceThreadTs: payload.sourceThreadTs,
        initiatedBy: payload.proposedBy,
        caseNumber: payload.caseNumber,
    };

    const sanitizedEntityName = sanitizeMrkdwn(proposal.entityName);
    const sanitizedSummary = sanitizeMrkdwn(proposal.summary);

    try {
      for (const action of proposal.actions) {
        if (action.type === "append_cmdb_identifier") {
          await this.repository.appendCmdbIdentifier(proposal.entityName, action.identifier, {
            createIfMissing: action.createEntityIfMissing,
            entityType: action.entityTypeIfCreate,
          });
        } else {
          console.warn(`[ContextUpdateManager] Unsupported action ${action.type}`);
        }
      }

      const blocks: KnownBlock[] = [
        createSectionBlock(
          `${MessageEmojis.SUCCESS} *Context update applied* for *${sanitizedEntityName}* by <@${userId}>`
        ),
        createSectionBlock(sanitizedSummary),
      ];

      await slackMessaging.updateMessage({
        channel: workflow.contextKey?.split(':')[1] || '',
        ts: workflow.workflowReferenceId.split(':')[1],
        text: `${MessageEmojis.SUCCESS} Context update applied for ${sanitizePlainText(proposal.entityName, 100)}`,
        blocks,
      });
      
      await workflowManager.transition(workflow.id, workflow.version, { toState: 'APPROVED', lastModifiedBy: userId });

      if (proposal.sourceThreadTs) {
        await slackMessaging.postMessage({
          channel: proposal.sourceChannelId,
          threadTs: proposal.sourceThreadTs,
          text: `${MessageEmojis.SUCCESS} Context update approved by <@${userId}> — ${sanitizePlainText(proposal.entityName, 100)} will be updated.`,
        });
      }

      // Refresh cache so subsequent lookups see latest data
      await getBusinessContextService().refreshContext(proposal.entityName);
    } catch (error) {
      console.error("[ContextUpdateManager] Failed to apply context update", error);
      await slackMessaging.postMessage({
        channel: workflow.contextKey?.split(':')[1] || '',
        threadTs: workflow.workflowReferenceId.split(':')[1],
        text: `${MessageEmojis.ERROR} Error applying context update for ${sanitizePlainText(proposal.entityName, 100)}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
       await workflowManager.transition(workflow.id, workflow.version, { toState: 'FAILED', reason: 'Failed to apply update' });
    }
  }

  private async rejectUpdate(workflow: Workflow, userId: string): Promise<void> {
    if (!workflowManager) {
        throw new Error("WorkflowManager not available.");
    }
    const payload = workflow.payload as ContextUpdateWorkflowPayload;
    const proposal: ContextUpdateProposal = {
        entityName: payload.entityName,
        summary: payload.proposedChanges.summary,
        //...
    } as ContextUpdateProposal;


    const sanitizedEntityName = sanitizeMrkdwn(proposal.entityName);
    const sanitizedSummary = sanitizeMrkdwn(proposal.summary);

    const blocks: KnownBlock[] = [
      createSectionBlock(
        `${MessageEmojis.ERROR} *Context update rejected* for *${sanitizedEntityName}* by <@${userId}>`
      ),
      createSectionBlock(sanitizedSummary),
    ];

    await slackMessaging.updateMessage({
        channel: workflow.contextKey?.split(':')[1] || '',
        ts: workflow.workflowReferenceId.split(':')[1],
      text: `${MessageEmojis.ERROR} Context update rejected for ${sanitizePlainText(proposal.entityName, 100)}`,
      blocks,
    });
    
    await workflowManager.transition(workflow.id, workflow.version, { toState: 'REJECTED', lastModifiedBy: userId });

    if (payload.sourceThreadTs) {
      await slackMessaging.postMessage({
        channel: payload.sourceChannelId,
        threadTs: payload.sourceThreadTs,
        text: `${MessageEmojis.ERROR} Context update was rejected by <@${userId}>. No changes were made.`,
      });
    }
  }
}

let contextUpdateManager: ContextUpdateManager | null = null;

export function getContextUpdateManager(): ContextUpdateManager {
  if (!contextUpdateManager) {
    contextUpdateManager = new ContextUpdateManager();
  }
  return contextUpdateManager;
}