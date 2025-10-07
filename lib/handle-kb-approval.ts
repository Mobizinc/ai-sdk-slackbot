/**
 * KB Approval Handler
 * Manages emoji reactions for KB article approval workflow
 */

import { client } from "./slack-utils";
import type { KBArticle } from "./services/kb-generator";

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
    // Post the KB article to Slack
    const result = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: messageText,
      unfurl_links: false,
    });

    if (!result.ts) {
      throw new Error("Failed to post KB approval message - no timestamp returned");
    }

    // Store for approval tracking
    this.storePendingApproval(result.ts, channelId, caseNumber, article, threadTs);
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
   * Handle reaction added to a KB proposal
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
      // Update the message to show approved status
      await client.chat.update({
        channel: approval.channelId,
        ts: approval.messageTs,
        text: `✅ *KB Article Approved* by <@${userId}>`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *KB Article Approved* by <@${userId}>\n\n_Case: ${approval.caseNumber}_`,
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: this.formatApprovedArticle(approval.article),
            },
          },
        ],
      });

      // Post confirmation in thread
      await client.chat.postMessage({
        channel: approval.channelId,
        thread_ts: approval.threadTs,
        text: `✅ Knowledge base article for ${approval.caseNumber} has been approved!\n\n` +
          `_Next step: This article can be added to ServiceNow knowledge base._\n\n` +
          `*Article Summary:*\n${approval.article.title}`,
      });

      // TODO: Optional - Auto-create in ServiceNow KB
      // await this.createInServiceNow(approval.article, approval.caseNumber);

    } catch (error) {
      console.error("Error handling KB approval:", error);

      await client.chat.postMessage({
        channel: approval.channelId,
        thread_ts: approval.threadTs,
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
      // Update the message to show rejected status
      await client.chat.update({
        channel: approval.channelId,
        ts: approval.messageTs,
        text: `❌ *KB Article Rejected* by <@${userId}>`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `❌ *KB Article Rejected* by <@${userId}>\n\n_Case: ${approval.caseNumber}_`,
            },
          },
        ],
      });

      // Post confirmation in thread
      await client.chat.postMessage({
        channel: approval.channelId,
        thread_ts: approval.threadTs,
        text: `❌ Knowledge base article for ${approval.caseNumber} was rejected.\n\n` +
          `_The article draft will not be created._`,
      });
    } catch (error) {
      console.error("Error handling KB rejection:", error);
    }
  }

  /**
   * Format approved article for display
   */
  private formatApprovedArticle(article: KBArticle): string {
    let formatted = `*${article.title}*\n\n`;
    formatted += `📋 *Problem:* ${article.problem.substring(0, 150)}${article.problem.length > 150 ? "..." : ""}\n\n`;
    formatted += `✅ *Solution:* ${article.solution.substring(0, 200)}${article.solution.length > 200 ? "..." : ""}\n\n`;

    if (article.tags.length > 0) {
      formatted += `🏷️ *Tags:* ${article.tags.slice(0, 5).join(", ")}`;
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
