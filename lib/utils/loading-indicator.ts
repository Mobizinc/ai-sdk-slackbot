/**
 * Loading Indicator Utility
 * Provides visual feedback for long-running operations in Slack
 */

import { getSlackMessagingService } from "../services/slack-messaging";
import {
  createSectionBlock,
  MessageEmojis,
  type KnownBlock,
} from "./message-styling";

const slackMessaging = getSlackMessagingService();

export type OperationType =
  | "kb_generation"
  | "classification"
  | "escalation"
  | "analysis"
  | "processing";

interface LoadingMessage {
  channel: string;
  threadTs?: string;
  messageTs: string;
  operation: OperationType;
  startTime: Date;
}

/**
 * Loading indicator manager for Slack messages
 */
export class LoadingIndicator {
  private activeIndicators: Map<string, LoadingMessage> = new Map();

  /**
   * Post a loading message to indicate operation in progress
   *
   * @param channel - Slack channel ID
   * @param threadTs - Thread timestamp (optional, for threaded messages)
   * @param operation - Type of operation being performed
   * @returns Message timestamp for later updates
   */
  async postLoadingMessage(
    channel: string,
    threadTs: string | undefined,
    operation: OperationType
  ): Promise<string> {
    const loadingText = this.getLoadingText(operation);
    const blocks = this.buildLoadingBlocks(operation);

    try {
      const result = await slackMessaging.postMessage({
        channel,
        threadTs: threadTs,
        text: loadingText,
        blocks,
        unfurlLinks: false,
      });

      if (!result.ts) {
        throw new Error("Failed to post loading message - no timestamp returned");
      }

      // Store for later update
      this.activeIndicators.set(result.ts, {
        channel,
        threadTs,
        messageTs: result.ts,
        operation,
        startTime: new Date(),
      });

      return result.ts;
    } catch (error) {
      console.error("[Loading Indicator] Failed to post loading message:", error);
      throw error;
    }
  }

  /**
   * Update loading message to success state
   *
   * @param messageTs - Message timestamp to update
   * @param result - Success message or result summary
   */
  async updateToSuccess(messageTs: string, result?: string): Promise<void> {
    const indicator = this.activeIndicators.get(messageTs);

    if (!indicator) {
      console.warn(`[Loading Indicator] No active indicator found for ${messageTs}`);
      return;
    }

    const elapsed = Date.now() - indicator.startTime.getTime();
    const elapsedSeconds = (elapsed / 1000).toFixed(1);

    const successText = this.getSuccessText(indicator.operation, result);
    const blocks = this.buildSuccessBlocks(indicator.operation, result, elapsedSeconds);

    try {
      await slackMessaging.updateMessage({
        channel: indicator.channel,
        ts: messageTs,
        text: successText,
        blocks,
      });

      this.activeIndicators.delete(messageTs);
    } catch (error) {
      console.error("[Loading Indicator] Failed to update to success:", error);
    }
  }

  /**
   * Update loading message to error state
   *
   * @param messageTs - Message timestamp to update
   * @param error - Error message or description
   */
  async updateToError(messageTs: string, error: string): Promise<void> {
    const indicator = this.activeIndicators.get(messageTs);

    if (!indicator) {
      console.warn(`[Loading Indicator] No active indicator found for ${messageTs}`);
      return;
    }

    const elapsed = Date.now() - indicator.startTime.getTime();
    const elapsedSeconds = (elapsed / 1000).toFixed(1);

    const errorText = this.getErrorText(indicator.operation, error);
    const blocks = this.buildErrorBlocks(indicator.operation, error, elapsedSeconds);

    try {
      await slackMessaging.updateMessage({
        channel: indicator.channel,
        ts: messageTs,
        text: errorText,
        blocks,
      });

      this.activeIndicators.delete(messageTs);
    } catch (updateError) {
      console.error("[Loading Indicator] Failed to update to error:", updateError);
    }
  }

  /**
   * Delete loading message (useful if operation is cancelled)
   */
  async deleteLoadingMessage(messageTs: string): Promise<void> {
    const indicator = this.activeIndicators.get(messageTs);

    if (!indicator) {
      return;
    }

    try {
      await slackMessaging.deleteMessage({
        channel: indicator.channel,
        ts: messageTs,
      });

      this.activeIndicators.delete(messageTs);
    } catch (error) {
      console.error("[Loading Indicator] Failed to delete message:", error);
    }
  }

  /**
   * Get loading text for operation type
   */
  private getLoadingText(operation: OperationType): string {
    const messages: Record<OperationType, string> = {
      kb_generation: "🤖 Generating knowledge base article...",
      classification: "🔍 Analyzing case details...",
      escalation: "⚡ Generating escalation summary...",
      analysis: "🧠 Processing analysis...",
      processing: "⏳ Processing...",
    };

    return messages[operation] || messages.processing;
  }

  /**
   * Build loading state blocks
   */
  private buildLoadingBlocks(operation: OperationType): any[] {
    const emoji = this.getOperationEmoji(operation);
    const description = this.getOperationDescription(operation);

    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${description}*\n\n_This may take 15-45 seconds. Please wait..._`,
        },
      },
    ];
  }

  /**
   * Build success state blocks
   */
  private buildSuccessBlocks(
    operation: OperationType,
    result: string | undefined,
    elapsedSeconds: string
  ): KnownBlock[] {
    const description = this.getOperationDescription(operation);

    let text = `${MessageEmojis.SUCCESS} *${description} Complete*\n\n`;

    if (result) {
      text += `${result}\n\n`;
    }

    text += `_Completed in ${elapsedSeconds}s_`;

    return [
      createSectionBlock(text)
    ];
  }

  /**
   * Build error state blocks
   */
  private buildErrorBlocks(
    operation: OperationType,
    error: string,
    elapsedSeconds: string
  ): KnownBlock[] {
    const description = this.getOperationDescription(operation);

    const text =
      `${MessageEmojis.ERROR} *${description} Failed*\n\n` +
      `${error}\n\n` +
      `_Failed after ${elapsedSeconds}s_`;

    return [
      createSectionBlock(text)
    ];
  }

  /**
   * Get operation emoji using consistent constants
   */
  private getOperationEmoji(operation: OperationType): string {
    const emojis: Record<OperationType, string> = {
      kb_generation: MessageEmojis.PROCESSING,
      classification: MessageEmojis.SEARCH,
      escalation: MessageEmojis.LIGHTNING,
      analysis: MessageEmojis.BRAIN,
      processing: MessageEmojis.PROCESSING,
    };

    return emojis[operation] || MessageEmojis.PROCESSING;
  }

  /**
   * Get operation description
   */
  private getOperationDescription(operation: OperationType): string {
    const descriptions: Record<OperationType, string> = {
      kb_generation: "Generating Knowledge Base Article",
      classification: "Analyzing Case",
      escalation: "Processing Escalation",
      analysis: "Running Analysis",
      processing: "Processing Request",
    };

    return descriptions[operation] || "Processing";
  }

  /**
   * Get success text
   */
  private getSuccessText(operation: OperationType, result?: string): string {
    return `✅ ${this.getOperationDescription(operation)} complete${result ? `: ${result}` : ""}`;
  }

  /**
   * Get error text
   */
  private getErrorText(operation: OperationType, error: string): string {
    return `❌ ${this.getOperationDescription(operation)} failed: ${error}`;
  }

  /**
   * Get count of active indicators
   */
  getActiveCount(): number {
    return this.activeIndicators.size;
  }

  /**
   * Clean up old indicators (called periodically)
   */
  cleanupOldIndicators(maxAgeMinutes: number = 10): number {
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;
    let removed = 0;

    for (const [ts, indicator] of this.activeIndicators.entries()) {
      const age = now - indicator.startTime.getTime();

      if (age > maxAge) {
        this.activeIndicators.delete(ts);
        removed++;
      }
    }

    return removed;
  }
}

// Singleton instance
let indicatorInstance: LoadingIndicator | null = null;

export function getLoadingIndicator(): LoadingIndicator {
  if (!indicatorInstance) {
    indicatorInstance = new LoadingIndicator();

    // Run cleanup every 5 minutes
    setInterval(() => {
      const removed = indicatorInstance!.cleanupOldIndicators(10);
      if (removed > 0) {
        console.log(`[Loading Indicator] Cleaned up ${removed} old indicators`);
      }
    }, 5 * 60 * 1000);
  }

  return indicatorInstance;
}
