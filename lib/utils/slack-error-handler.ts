/**
 * Slack Error Handler Utility
 *
 * Provides standardized error handling for Slack message operations.
 * Extracted from handle-app-mention.ts and handle-messages.ts to reduce DRY violations.
 *
 * Benefits:
 * - Consistent error message formatting across handlers
 * - Centralized error logging
 * - Reusable error handling logic
 * - Easier to maintain and test
 */

import { getSlackMessagingService } from '../services/slack-messaging';
import type { StatusUpdater } from './slack-status-updater';

/**
 * Options for posting error messages
 */
export interface PostErrorOptions {
  /** Slack channel ID */
  channel: string;
  /** Thread timestamp for threaded messages */
  threadTs: string;
  /** The error that occurred */
  error: unknown;
  /** Optional custom error prefix message */
  errorPrefix?: string;
  /** Optional log context for debugging */
  logContext?: string;
  /** Maximum length for error message details (default: 180) */
  maxErrorLength?: number;
}

/**
 * Post an error message to Slack with standardized formatting
 *
 * @param options - Error posting options
 *
 * @example
 * ```typescript
 * try {
 *   // ... some operation
 * } catch (error) {
 *   await postErrorToSlack({
 *     channel: event.channel,
 *     threadTs: event.thread_ts,
 *     error,
 *     errorPrefix: "Failed to triage case",
 *     logContext: "[App Mention]"
 *   });
 * }
 * ```
 */
export async function postErrorToSlack(options: PostErrorOptions): Promise<void> {
  const {
    channel,
    threadTs,
    error,
    errorPrefix = "Sorry, I ran into a problem",
    logContext = "[Error Handler]",
    maxErrorLength = 180,
  } = options;

  // Log the error
  console.error(`${logContext} Error:`, error);

  // Extract error message
  const errorMessage = (error instanceof Error ? error.message : "Unexpected error")
    .slice(0, maxErrorLength);

  // Format the error message for Slack
  const slackMessage = `${errorPrefix}. Please try again in a moment. (${errorMessage})`;

  // Post to Slack
  const slackMessaging = getSlackMessagingService();
  await slackMessaging.postMessage({
    channel,
    threadTs,
    text: slackMessage,
  });
}

/**
 * Post an error message using a status updater's setFinalMessage method
 *
 * This is useful when you already have a StatusUpdater instance and want to
 * replace the status message with an error message.
 *
 * @param statusUpdater - The status updater instance
 * @param error - The error that occurred
 * @param errorPrefix - Optional custom error prefix message
 * @param logContext - Optional log context for debugging
 *
 * @example
 * ```typescript
 * const { updateStatus, setFinalMessage } = await createStatusUpdater(...);
 * try {
 *   await updateStatus("processing...");
 *   // ... some operation
 * } catch (error) {
 *   await setErrorWithStatusUpdater(
 *     { setFinalMessage },
 *     error,
 *     "Failed to process request",
 *     "[Handler]"
 *   );
 * }
 * ```
 */
export async function setErrorWithStatusUpdater(
  statusUpdater: Pick<StatusUpdater, 'setFinalMessage'>,
  error: unknown,
  errorPrefix?: string,
  logContext: string = "[Error Handler]"
): Promise<void> {
  // Log the error
  console.error(`${logContext} Error:`, error);

  // Extract error message
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  // Format the error message
  const prefix = errorPrefix || "An error occurred";
  const fullMessage = `${prefix}. ${errorMessage}`;

  // Set as final message
  await statusUpdater.setFinalMessage(fullMessage);
}
