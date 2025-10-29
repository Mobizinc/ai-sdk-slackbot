/**
 * KB Approval Handler
 * Manages emoji reactions for KB article approval workflow
 */

import { getSlackMessagingService } from "./services/slack-messaging";
import type { KBArticle } from "./services/kb-generator";
import {
  createHeaderBlock,
  createSectionBlock,
  createDivider,
  createContextBlock,
  createButton,
  createInputBlock,
  createCheckboxes,
  sanitizeMrkdwn,
  sanitizePlainText,
  truncateText,
  validateBlockCount,
  MessageEmojis,
  type KnownBlock,
} from "./utils/message-styling";

const slackMessaging = getSlackMessagingService();

interface PendingKBApproval {
  caseNumber: string;
  article: KBArticle;
  messageTs: string;
  channelId: string;
  threadTs: string;
  createdAt: Date;
}

export class KBApprovalManager {
  private pendingApprovals: Map<string, PendingKBApproval> = new Map();

  /**
   * Post KB article for approval and track it
   */
  async postForApproval(
    caseNumber: string,
    channelId: string,
    threadTs: string,
    article: KBArticle,
    messageText: string
  ): Promise<void> {
    // Build Block Kit message with article preview and action buttons
    const blocks = this.buildApprovalBlocks(caseNumber, article);

    // Post the KB article to Slack with interactive buttons
    const result = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: messageText, // Fallback text for notifications
      blocks,
      unfurl_links: false,
    });

    if (!result.ts) {
      throw new Error("Failed to post KB approval message - no timestamp returned");
    }

    // Store for approval tracking
    this.storePendingApproval(result.ts, channelId, caseNumber, article, threadTs);
  }

  /**
   * Build Block Kit blocks for KB approval message
   */
  private buildApprovalBlocks(caseNumber: string, article: KBArticle): any[] {
    const blocks: any[] = [];

    // Header
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📚 KB Article Ready for Review`,
        emoji: true,
      },
    });

    // Case number context
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Case: *${caseNumber}*`,
        },
      ],
    });

    // Title
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${article.title}*`,
      },
    });

    // Problem
    const problemPreview =
      article.problem.length > 200
        ? `${article.problem.substring(0, 200)}...`
        : article.problem;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Problem:*\n${problemPreview}`,
      },
    });

    // Solution preview
    const solutionPreview =
      article.solution.length > 300
        ? `${article.solution.substring(0, 300)}...`
        : article.solution;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Solution:*\n${solutionPreview}`,
      },
    });

    // Tags if available
    if (article.tags.length > 0) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🏷️ ${article.tags.slice(0, 5).join(" • ")}`,
          },
        ],
      });
    }

    // Divider
    blocks.push({
      type: "divider",
    });

    // Action buttons
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "✅ Approve",
            emoji: true,
          },
          style: "primary",
          value: `kb_approve:${caseNumber}`,
          action_id: "kb_approve",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "❌ Reject",
            emoji: true,
          },
          style: "danger",
          value: `kb_reject:${caseNumber}`,
          action_id: "kb_reject",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📝 Edit & Approve",
            emoji: true,
          },
          value: `kb_edit:${caseNumber}`,
          action_id: "kb_edit",
        },
      ],
    });

    // Footer with instructions
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Review the article above and choose an action. Approved articles will be created in ServiceNow knowledge base._",
        },
      ],
    });

    return blocks;
  }

  /**
   * Store a pending KB approval
   */
  storePendingApproval(
    messageTs: string,
    channelId: string,
    caseNumber: string,
    article: KBArticle,
    threadTs: string
  ): void {
    const key = this.getApprovalKey(channelId, messageTs);

    this.pendingApprovals.set(key, {
      caseNumber,
      article,
      messageTs,
      channelId,
      threadTs,
      createdAt: new Date(),
    });

    // Auto-cleanup old approvals after 24 hours
    setTimeout(() => {
      this.pendingApprovals.delete(key);
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Handle button click for KB approval/rejection
   * Called from interactivity API endpoint
   */
  async handleButtonClick(
    action: "approve" | "reject" | "edit",
    channelId: string,
    messageTs: string,
    userId: string
  ): Promise<{ success: boolean; message?: string }> {
    const key = this.getApprovalKey(channelId, messageTs);
    const approval = this.pendingApprovals.get(key);

    if (!approval) {
      return {
        success: false,
        message: "KB approval request not found or already processed",
      };
    }

    try {
      if (action === "approve") {
        await this.handleApproval(approval, userId);
        this.pendingApprovals.delete(key);
        return {
          success: true,
          message: `KB article for ${approval.caseNumber} approved`,
        };
      } else if (action === "reject") {
        await this.handleRejection(approval, userId);
        this.pendingApprovals.delete(key);
        return {
          success: true,
          message: `KB article for ${approval.caseNumber} rejected`,
        };
      } else if (action === "edit") {
        // TODO: Open modal for editing
        return {
          success: false,
          message: "Edit functionality coming soon",
        };
      }

      return {
        success: false,
        message: "Unknown action",
      };
    } catch (error) {
      console.error("[KB Approval] Error handling button click:", error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Handle reaction added to a KB proposal (DEPRECATED - keeping for backward compatibility)
   * Use handleButtonClick for new button-based approvals
   */
  async handleReaction(
    channelId: string,
    messageTs: string,
    reaction: string,
    userId: string
  ): Promise<void> {
    const key = this.getApprovalKey(channelId, messageTs);
    const approval = this.pendingApprovals.get(key);

    if (!approval) {
      // Not a KB approval message, ignore
      return;
    }

    if (reaction === "+1" || reaction === "white_check_mark" || reaction === "heavy_check_mark") {
      await this.handleApproval(approval, userId);
      this.pendingApprovals.delete(key);
    } else if (reaction === "-1" || reaction === "x" || reaction === "negative_squared_cross_mark") {
      await this.handleRejection(approval, userId);
      this.pendingApprovals.delete(key);
    }
  }

  /**
   * Handle KB approval
   */
  private async handleApproval(
    approval: PendingKBApproval,
    userId: string
  ): Promise<void> {
    try {
      // Sanitize case number
      const sanitizedCaseNumber = sanitizePlainText(approval.caseNumber, 100);

      // Update the message to show approved status using design system
      await slackMessaging.updateMessage({
        channel: approval.channelId,
        ts: approval.messageTs,
        text: `${MessageEmojis.SUCCESS} KB Article Approved by <@${userId}>`,
        blocks: [
          createSectionBlock(
            `${MessageEmojis.KB_APPROVED} *KB Article Approved* by <@${userId}>\n\n_Case: ${sanitizedCaseNumber}_`
          ),
          createDivider(),
          createSectionBlock(
            this.formatApprovedArticle(approval.article)
          ),
        ],
      });

      // Post confirmation in thread
      await slackMessaging.postMessage({
        channel: approval.channelId,
        threadTs: approval.threadTs,
        text: `✅ Knowledge base article for ${approval.caseNumber} has been approved!\n\n` +
          `_Next step: This article can be added to ServiceNow knowledge base._\n\n` +
          `*Article Summary:*\n${approval.article.title}`,
      });

      // TODO: Optional - Auto-create in ServiceNow KB
      // await this.createInServiceNow(approval.article, approval.caseNumber);

    } catch (error) {
      console.error("Error handling KB approval:", error);

      await slackMessaging.postMessage({
        channel: approval.channelId,
        threadTs: approval.threadTs,
        text: `❌ Error processing approval: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  /**
   * Handle KB rejection
   */
  private async handleRejection(
    approval: PendingKBApproval,
    userId: string
  ): Promise<void> {
    try {
      // Sanitize case number
      const sanitizedCaseNumber = sanitizePlainText(approval.caseNumber, 100);

      // Update the message to show rejected status using design system
      await slackMessaging.updateMessage({
        channel: approval.channelId,
        ts: approval.messageTs,
        text: `${MessageEmojis.ERROR} KB Article Rejected by <@${userId}>`,
        blocks: [
          createSectionBlock(
            `${MessageEmojis.KB_REJECTED} *KB Article Rejected* by <@${userId}>\n\n_Case: ${sanitizedCaseNumber}_`
          ),
        ],
      });

      // Post confirmation in thread
      await slackMessaging.postMessage({
        channel: approval.channelId,
        threadTs: approval.threadTs,
        text: `❌ Knowledge base article for ${approval.caseNumber} was rejected.\n\n` +
          `_The article draft will not be created._`,
      });
    } catch (error) {
      console.error("Error handling KB rejection:", error);
    }
  }

  /**
   * Format approved article for display with sanitization
   */
  private formatApprovedArticle(article: KBArticle): string {
    // Sanitize all user-generated content
    const sanitizedTitle = sanitizeMrkdwn(article.title);
    const problemPreview = truncateText(sanitizeMrkdwn(article.problem), 150);
    const solutionPreview = truncateText(sanitizeMrkdwn(article.solution), 200);

    let formatted = `*${sanitizedTitle}*\n\n`;
    formatted += `${MessageEmojis.REQUEST} *Problem:* ${problemPreview}\n\n`;
    formatted += `${MessageEmojis.SUCCESS} *Solution:* ${solutionPreview}\n\n`;

    if (article.tags.length > 0) {
      const sanitizedTags = article.tags
        .slice(0, 5)
        .map(tag => sanitizeMrkdwn(tag))
        .join(", ");
      formatted += `${MessageEmojis.TAG} *Tags:* ${sanitizedTags}`;
    }

    return formatted;
  }

  /**
   * Generate unique key for approval tracking
   */
  private getApprovalKey(channelId: string, messageTs: string): string {
    return `${channelId}:${messageTs}`;
  }

  /**
   * Get pending approval count
   */
  getPendingCount(): number {
    return this.pendingApprovals.size;
  }

  /**
   * Clean up old pending approvals (called periodically)
   */
  cleanupOldApprovals(): number {
    const now = new Date();
    const cutoffTime = now.getTime() - 24 * 60 * 60 * 1000; // 24 hours
    let removed = 0;

    for (const [key, approval] of this.pendingApprovals.entries()) {
      if (approval.createdAt.getTime() < cutoffTime) {
        this.pendingApprovals.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * TODO: Create KB article in ServiceNow
   * This is a placeholder for future ServiceNow KB integration
   */
  private async createInServiceNow(
    article: KBArticle,
    caseNumber: string
  ): Promise<void> {
    // Implementation would use ServiceNow Table API to create KB article
    // POST to /api/now/table/kb_knowledge
    console.log(
      `TODO: Create KB article in ServiceNow for case ${caseNumber}`,
      article.title
    );

    /*
    Example ServiceNow KB creation:

    const kbData = {
      short_description: article.title,
      text: `
        <h2>Problem</h2>
        <p>${article.problem}</p>

        <h2>Environment</h2>
        <p>${article.environment}</p>

        <h2>Solution</h2>
        ${article.solution}

        <h2>Root Cause</h2>
        <p>${article.rootCause || 'See solution details'}</p>
      `,
      kb_category: '...', // Map from tags
      kb_knowledge_base: '...', // Your KB sys_id
      workflow_state: 'draft', // Start as draft for review
    };

    await serviceNowClient.createKBArticle(kbData);
    */
  }
}

// Global singleton instance
let kbApprovalManager: KBApprovalManager | null = null;

export function getKBApprovalManager(): KBApprovalManager {
  if (!kbApprovalManager) {
    kbApprovalManager = new KBApprovalManager();

    // Run cleanup every hour
    setInterval(() => {
      const removed = kbApprovalManager!.cleanupOldApprovals();
      if (removed > 0) {
        console.log(`Cleaned up ${removed} old KB approval requests`);
      }
    }, 60 * 60 * 1000);
  }
  return kbApprovalManager;
}
