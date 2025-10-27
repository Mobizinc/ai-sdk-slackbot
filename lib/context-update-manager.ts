import type { BusinessContextCmdbIdentifier } from "./db/schema";
import { getBusinessContextRepository } from "./db/repositories/business-context-repository";
import { getBusinessContextService } from "./services/business-context-service";
import { getSlackMessagingService } from "./services/slack-messaging";

const slackMessaging = getSlackMessagingService();

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
      const label = id.ciName || id.sysId || `identifier-${index + 1}`;
      const lines: string[] = [];
      lines.push(`• *Add CMDB entry* ${label}`);
      if (id.ipAddresses?.length) {
        lines.push(`  • IPs: ${id.ipAddresses.join(", ")}`);
      } else {
        lines.push(`  • IPs: not provided`);
      }
      if (id.ownerGroup) {
        lines.push(`  • Owner: ${id.ownerGroup}`);
      }
      if (id.description) {
        lines.push(`  • Summary: ${id.description}`);
      }
      if (id.documentation?.length) {
        lines.push(`  • Docs: ${id.documentation.join("; ")}`);
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
    const stewardText = buildMentionText(proposal.stewardMentions);
    const actionsText = formatActions(proposal.actions);
    const confidenceText = formatConfidence(proposal.confidence);

    const summaryBlock = proposal.details
      ? `${proposal.summary}\n\n_${proposal.details}_`
      : proposal.summary;

    const caseLine = proposal.caseNumber ? `Case: *${proposal.caseNumber}*` : undefined;
    const initiatorLine = proposal.initiatedBy
      ? `Proposed by: *${proposal.initiatedBy}*`
      : "Proposed by: *PeterPool (auto)*";

    const headerText = `*Context Update Review* — ${proposal.entityName}`;
    const postText = `${headerText}\n${stewardText}\n${summaryBlock}`;

    const result = await slackMessaging.postMessage({
      channel: proposal.stewardChannelId,
      text: postText,
      unfurlLinks: false,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: headerText,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${stewardText}\n${initiatorLine}${
              caseLine ? `\n${caseLine}` : ""
            }\nConfidence: *${confidenceText}*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: summaryBlock,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Requested actions*\n${actionsText}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "React with :white_check_mark: to apply or :x: to reject.",
            },
          ],
        },
      ],
    });

    if (!result.ts) {
      throw new Error("Failed to post context update proposal (missing timestamp)");
    }

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

    return { messageTs: result.ts };
  }

  async handleReaction(
    channelId: string,
    messageTs: string,
    reaction: string,
    userId: string
  ): Promise<void> {
    const key = this.getCacheKey(channelId, messageTs);
    const pending = this.pending.get(key);

    if (!pending) return; // not a tracked message

    const isApproval =
      reaction === "+1" || reaction === "white_check_mark" || reaction === "heavy_check_mark";
    const isRejection = reaction === "-1" || reaction === "x" || reaction === "negative_squared_cross_mark";

    if (!isApproval && !isRejection) {
      return;
    }

    if (isApproval) {
      await this.applyApprovedUpdate(pending, userId);
    } else if (isRejection) {
      await this.rejectUpdate(pending, userId);
    }

    this.pending.delete(key);
  }

  private async applyApprovedUpdate(pending: PendingContextUpdate, userId: string): Promise<void> {
    const { proposal } = pending;
    const repo = this.repository;
    const service = getBusinessContextService();

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

      await slackMessaging.updateMessage({
        channel: pending.approvalChannelId,
        ts: pending.approvalMessageTs,
        text: `✅ Context update applied for ${proposal.entityName}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *Context update applied* for *${proposal.entityName}* by <@${userId}>`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: proposal.summary,
            },
          },
        ],
      });

      if (proposal.sourceThreadTs) {
        await slackMessaging.postMessage({
          channel: proposal.sourceChannelId,
          threadTs: proposal.sourceThreadTs,
          text: `✅ Context update approved by <@${userId}> — ${proposal.entityName} will be updated.`,
        });
      }

      // Refresh cache so subsequent lookups see latest data
      await service.refreshContext(proposal.entityName);
    } catch (error) {
      console.error("[ContextUpdateManager] Failed to apply context update", error);
      await slackMessaging.postMessage({
        channel: pending.approvalChannelId,
        threadTs: pending.approvalMessageTs,
        text: `❌ Error applying context update for ${proposal.entityName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  private async rejectUpdate(pending: PendingContextUpdate, userId: string): Promise<void> {
    const { proposal } = pending;

    await slackMessaging.updateMessage({
      channel: pending.approvalChannelId,
      ts: pending.approvalMessageTs,
      text: `❌ Context update rejected for ${proposal.entityName}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ *Context update rejected* for *${proposal.entityName}* by <@${userId}>`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: proposal.summary,
          },
        },
      ],
    });

    if (proposal.sourceThreadTs) {
      await slackMessaging.postMessage({
        channel: proposal.sourceChannelId,
        threadTs: proposal.sourceThreadTs,
        text: `❌ Context update was rejected by <@${userId}>. No changes were made.`,
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
