import type { BusinessContextCmdbIdentifier } from "./db/schema";
import { getBusinessContextRepository } from "./db/repositories/business-context-repository";
import { getBusinessContextService } from "./services/business-context-service";
import { getSlackMessagingService } from "./services/slack-messaging";
import { getInteractiveStateManager } from "./services/interactive-state-manager";
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
const stateManager = getInteractiveStateManager();

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

interface PendingContextUpdate {
  proposal: ContextUpdateProposal;
  approvalMessageTs: string;
  approvalChannelId: string;
  createdAt: Date;
}

function buildMentionText(targets: string[]): string {
  if (targets.length === 0) {
    return "Stewards";
  }
  return targets.join(" ");
}

function formatConfidence(confidence: ContextUpdateProposal["confidence"]): string {
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
  private pending = new Map<string, PendingContextUpdate>();
  private repository = getBusinessContextRepository();

  private getCacheKey(channelId: string, messageTs: string): string {
    return `${channelId}:${messageTs}`;
  }

  async postProposal(proposal: ContextUpdateProposal): Promise<{ messageTs: string }> {
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

    // Persist to database (48-hour expiration) instead of in-memory Map
    await stateManager.saveState(
      'context_update',
      proposal.stewardChannelId,
      result.ts,
      {
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
      },
      {
        expiresInHours: 48,
        threadTs: proposal.sourceThreadTs,
        metadata: {
          caseNumber: proposal.caseNumber,
          stewardChannelName: proposal.stewardChannelName,
        },
      }
    );

    // DEPRECATED: Keep in-memory cache for backward compatibility (will be removed)
    const key = this.getCacheKey(proposal.stewardChannelId, result.ts);
    this.pending.set(key, {
      proposal,
      approvalMessageTs: result.ts,
      approvalChannelId: proposal.stewardChannelId,
      createdAt: new Date(),
    });

    // Auto-cleanup after 48 hours
    setTimeout(() => {
      this.pending.delete(key);
    }, 48 * 60 * 60 * 1000);

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
    // Try to get from database first (persistent), then fall back to in-memory cache
    let pending: PendingContextUpdate | null = null;
    let fromDatabase = false;

    // Check database first
    const dbState = await stateManager.getState<'context_update'>(channelId, messageTs, 'context_update');
    if (dbState) {
      fromDatabase = true;
      // Reconstruct PendingContextUpdate from database state
      pending = {
        proposal: {
          entityName: dbState.payload.entityName,
          summary: dbState.payload.proposedChanges.summary,
          details: dbState.payload.proposedChanges.details,
          actions: dbState.payload.proposedChanges.actions,
          stewardMentions: [], // Not needed for approval
          stewardChannelId: channelId,
          sourceChannelId: dbState.payload.sourceChannelId,
          sourceThreadTs: dbState.payload.sourceThreadTs,
          initiatedBy: dbState.payload.proposedBy,
          caseNumber: dbState.metadata?.caseNumber,
          confidence: dbState.payload.proposedChanges.confidence,
        },
        approvalMessageTs: messageTs,
        approvalChannelId: channelId,
        createdAt: dbState.createdAt,
      };
    } else {
      // Fall back to in-memory cache
      const key = this.getCacheKey(channelId, messageTs);
      pending = this.pending.get(key) || null;
    }

    if (!pending) {
      console.log(`[Context Update Manager] No pending update found for ${channelId}:${messageTs}`);
      return; // Not a tracked message
    }

    const isApproval =
      reaction === "+1" || reaction === "white_check_mark" || reaction === "heavy_check_mark";
    const isRejection = reaction === "-1" || reaction === "x" || reaction === "negative_squared_cross_mark";

    if (!isApproval && !isRejection) {
      return;
    }

    if (isApproval) {
      await this.applyApprovedUpdate(pending, userId);
      // Mark as approved in database
      await stateManager.markProcessed(channelId, messageTs, userId, 'approved');
    } else if (isRejection) {
      await this.rejectUpdate(pending, userId);
      // Mark as rejected in database
      await stateManager.markProcessed(channelId, messageTs, userId, 'rejected');
    }

    // Clean up in-memory cache
    const key = this.getCacheKey(channelId, messageTs);
    this.pending.delete(key);

    console.log(
      `[Context Update Manager] Processed ${isApproval ? 'approval' : 'rejection'} ` +
      `for ${pending.proposal.entityName} (source: ${fromDatabase ? 'database' : 'memory'})`
    );
  }

  private async applyApprovedUpdate(pending: PendingContextUpdate, userId: string): Promise<void> {
    const { proposal } = pending;
    const repo = this.repository;
    const service = getBusinessContextService();

    // CRITICAL: Sanitize entity name for display
    const sanitizedEntityName = sanitizeMrkdwn(proposal.entityName);
    const sanitizedSummary = sanitizeMrkdwn(proposal.summary);

    try {
      for (const action of proposal.actions) {
        if (action.type === "append_cmdb_identifier") {
          await repo.appendCmdbIdentifier(proposal.entityName, action.identifier, {
            createIfMissing: action.createEntityIfMissing,
            entityType: action.entityTypeIfCreate,
          });
        } else {
          console.warn(`[ContextUpdateManager] Unsupported action ${action.type}`);
        }
      }

      // Build blocks using design system with sanitized data
      const blocks: KnownBlock[] = [
        createSectionBlock(
          `${MessageEmojis.SUCCESS} *Context update applied* for *${sanitizedEntityName}* by <@${userId}>`
        ),
        createSectionBlock(sanitizedSummary),
      ];

      await slackMessaging.updateMessage({
        channel: pending.approvalChannelId,
        ts: pending.approvalMessageTs,
        text: `${MessageEmojis.SUCCESS} Context update applied for ${sanitizePlainText(proposal.entityName, 100)}`,
        blocks,
      });

      if (proposal.sourceThreadTs) {
        await slackMessaging.postMessage({
          channel: proposal.sourceChannelId,
          threadTs: proposal.sourceThreadTs,
          text: `${MessageEmojis.SUCCESS} Context update approved by <@${userId}> — ${sanitizePlainText(proposal.entityName, 100)} will be updated.`,
        });
      }

      // Refresh cache so subsequent lookups see latest data
      await service.refreshContext(proposal.entityName);
    } catch (error) {
      console.error("[ContextUpdateManager] Failed to apply context update", error);
      await slackMessaging.postMessage({
        channel: pending.approvalChannelId,
        threadTs: pending.approvalMessageTs,
        text: `${MessageEmojis.ERROR} Error applying context update for ${sanitizePlainText(proposal.entityName, 100)}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  private async rejectUpdate(pending: PendingContextUpdate, userId: string): Promise<void> {
    const { proposal } = pending;

    // CRITICAL: Sanitize entity name and summary for display
    const sanitizedEntityName = sanitizeMrkdwn(proposal.entityName);
    const sanitizedSummary = sanitizeMrkdwn(proposal.summary);

    // Build blocks using design system with sanitized data
    const blocks: KnownBlock[] = [
      createSectionBlock(
        `${MessageEmojis.ERROR} *Context update rejected* for *${sanitizedEntityName}* by <@${userId}>`
      ),
      createSectionBlock(sanitizedSummary),
    ];

    await slackMessaging.updateMessage({
      channel: pending.approvalChannelId,
      ts: pending.approvalMessageTs,
      text: `${MessageEmojis.ERROR} Context update rejected for ${sanitizePlainText(proposal.entityName, 100)}`,
      blocks,
    });

    if (proposal.sourceThreadTs) {
      await slackMessaging.postMessage({
        channel: proposal.sourceChannelId,
        threadTs: proposal.sourceThreadTs,
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
