/**
 * Slack Status Updater Utility
 *
 * Provides a reusable status updater with Block Kit UI for Slack message handlers.
 * Extracted from handle-app-mention.ts to improve code reusability and maintain DRY principles.
 *
 * Benefits:
 * - Consistent status update experience across handlers
 * - Centralized emoji mapping and text formatting
 * - Reusable across different Slack event handlers
 * - Easier to test and maintain
 */

import { getSlackMessagingService } from '../services/slack-messaging';

const SLACK_DISPLAY_TEXT_LIMIT = 12000;

/**
 * Status emoji mapping for different operations
 */
const STATUS_EMOJIS: Record<string, string> = {
  'is thinking...': '⏳',
  'thinking': '⏳',
  'calling-tool': '🔧',
  'is looking up': '🔍',
  'is searching': '🔎',
  'is fetching': '📥',
  'analyzing': '🧠',
  'is gathering': '📊',
};

/**
 * Clamp text to Slack's display limit
 */
export const clampTextForSlackDisplay = (text: string): string => {
  if (!text) return text;
  if (text.length <= SLACK_DISPLAY_TEXT_LIMIT) {
    return text;
  }
  return `${text.slice(0, SLACK_DISPLAY_TEXT_LIMIT - 1)}…`;
};

/**
 * Interface for status updater functions
 */
export interface StatusUpdater {
  /**
   * Update the status message (non-destructive - only updates status block)
   */
  updateStatus: (status: string) => Promise<void>;

  /**
   * Set the final message (destructive - replaces entire message)
   */
  setFinalMessage: (text: string, blocks?: any[]) => Promise<void>;
}

/**
 * Create a status updater for Slack messages with Block Kit UI
 *
 * Creates an initial "Processing..." message with a dedicated status block
 * that can be updated non-destructively. The final message replaces the entire content.
 *
 * @param channel - Slack channel ID
 * @param threadTs - Thread timestamp (for threaded messages)
 * @param initialStatus - Initial status text (default: "is thinking...")
 * @returns Object with updateStatus and setFinalMessage functions
 *
 * @example
 * ```typescript
 * const { updateStatus, setFinalMessage } = await createStatusUpdater(
 *   event.channel,
 *   event.thread_ts ?? event.ts,
 *   "is thinking..."
 * );
 *
 * await updateStatus("is searching for cases...");
 * // ... do work ...
 * await setFinalMessage("Found 3 cases!", blocks);
 * ```
 */
export async function createStatusUpdater(
  channel: string,
  threadTs: string,
  initialStatus: string = "is thinking..."
): Promise<StatusUpdater> {
  const slackMessaging = getSlackMessagingService();

  // Create initial message with dedicated status block
  const initialMessage = await slackMessaging.postMessage({
    channel,
    threadTs,
    text: "Processing your request...",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "_Processing your request..._"
        }
      },
      {
        type: "context",
        block_id: "status_block",
        elements: [
          {
            type: "mrkdwn",
            text: `⏳ ${initialStatus}`
          }
        ]
      }
    ]
  });

  if (!initialMessage || !initialMessage.ts) {
    throw new Error("Failed to post initial message");
  }

  // Non-destructive status update - only updates the status block
  const updateStatus = async (status: string) => {
    // Find matching emoji
    const emojiKey = Object.keys(STATUS_EMOJIS).find(key => status.includes(key)) || '';
    const emoji = STATUS_EMOJIS[emojiKey] || '⚙️';

    await slackMessaging.updateMessage({
      channel,
      ts: initialMessage.ts as string,
      text: "Processing your request...",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "_Processing your request..._"
          }
        },
        {
          type: "context",
          block_id: "status_block",
          elements: [
            {
              type: "mrkdwn",
              text: `${emoji} ${status}`
            }
          ]
        }
      ]
    });
  };

  // Destructive final update - replaces entire message with final content
  const setFinalMessage = async (text: string, blocks?: any[]) => {
    const displayText = clampTextForSlackDisplay(text);
    let finalBlocks = blocks;

    if ((!finalBlocks || finalBlocks.length === 0) && displayText && displayText.length > 2800) {
      const { splitTextIntoSectionBlocks } = await import("../formatters/servicenow-block-kit");
      finalBlocks = splitTextIntoSectionBlocks(displayText, "mrkdwn");
    }

    await slackMessaging.updateMessage({
      channel,
      ts: initialMessage.ts as string,
      text: displayText,
      blocks: finalBlocks,
    });
  };

  return { updateStatus, setFinalMessage };
}
