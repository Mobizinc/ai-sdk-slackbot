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
 * Debounce configuration for status updates
 * - MIN_UPDATE_INTERVAL_MS: Minimum time between actual Slack API calls
 * - DEBOUNCE_DELAY_MS: Wait this long before sending to coalesce rapid updates
 */
const MIN_UPDATE_INTERVAL_MS = 5000;  // 5 seconds between updates
const DEBOUNCE_DELAY_MS = 2000;       // 2 second debounce to coalesce rapid changes

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

  // Debouncing state for this status updater instance
  let lastUpdateTime = 0;
  let lastStatus = initialStatus;
  let pendingStatus: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Helper to actually send the status update to Slack
  const sendStatusUpdate = async (status: string) => {
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

    lastUpdateTime = Date.now();
    lastStatus = status;
  };

  // Non-destructive status update with debouncing
  // Coalesces rapid status changes into one update
  const updateStatus = async (status: string) => {
    // Skip duplicate statuses
    if (status === lastStatus && status === pendingStatus) {
      return;
    }

    pendingStatus = status;

    // Clear any existing debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;

    // If enough time has passed, send immediately
    if (timeSinceLastUpdate >= MIN_UPDATE_INTERVAL_MS) {
      await sendStatusUpdate(status);
      pendingStatus = null;
      return;
    }

    // Otherwise, debounce - wait and coalesce rapid updates
    debounceTimer = setTimeout(async () => {
      if (pendingStatus && pendingStatus !== lastStatus) {
        try {
          await sendStatusUpdate(pendingStatus);
        } catch (error) {
          console.error('[StatusUpdater] Debounced update failed:', error);
        }
        pendingStatus = null;
      }
    }, DEBOUNCE_DELAY_MS);
  };

  // Destructive final update - replaces entire message with final content
  const setFinalMessage = async (text: string, blocks?: any[]) => {
    // Cancel any pending debounced status update
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingStatus = null;

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
