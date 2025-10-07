/**
 * Passive message handler for detecting case numbers in Slack channels.
 * Monitors all messages (without @mentions) and tracks case-related conversations.
 */

import type { GenericMessageEvent } from "./slack-event-types";
import { client } from "./slack-utils";
import { getContextManager } from "./context-manager";
import { serviceNowClient } from "./tools/servicenow";

export async function handlePassiveMessage(
  event: GenericMessageEvent,
  botUserId: string
): Promise<void> {
  // Skip bot's own messages to prevent loops
  if (event.bot_id || event.user === botUserId) {
    return;
  }

  // Skip if message is empty
  if (!event.text || event.text.trim() === "") {
    return;
  }

  const contextManager = getContextManager();

  // Extract case numbers from message
  const caseNumbers = contextManager.extractCaseNumbers(event.text);

  if (caseNumbers.length === 0) {
    // No case numbers found - check if we're in an existing case thread
    if (event.thread_ts) {
      await addMessageToExistingThreads(event);
    }
    return;
  }

  // Found case numbers - process each one
  for (const caseNumber of caseNumbers) {
    await processCaseDetection(event, caseNumber, botUserId);
  }
}

/**
 * Process a detected case number
 */
async function processCaseDetection(
  event: GenericMessageEvent,
  caseNumber: string,
  botUserId: string
): Promise<void> {
  const contextManager = getContextManager();
  const threadTs = event.thread_ts || event.ts;
  const channelId = event.channel;

  // Add message to context
  contextManager.addMessage(caseNumber, channelId, threadTs, {
    user: event.user || "unknown",
    text: event.text || "",
    timestamp: event.ts,
    thread_ts: event.thread_ts,
  });

  // Check if this is the first time we're seeing this case in this thread
  const context = contextManager.getContext(caseNumber, threadTs);
  if (!context || context.messages.length > 1) {
    // Already tracking this thread, don't spam
    return;
  }

  // First detection - post tracking message
  try {
    const trackingMessage = await buildTrackingMessage(caseNumber);

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs === event.ts ? undefined : threadTs, // Don't create thread if it's a new message
      text: trackingMessage,
      unfurl_links: false,
    });
  } catch (error) {
    console.error(
      `Error posting tracking message for ${caseNumber}:`,
      error
    );
  }
}

/**
 * Build tracking message with case info
 */
async function buildTrackingMessage(caseNumber: string): Promise<string> {
  let message = `👀 Watching case *${caseNumber}*`;

  // Try to fetch basic case info from ServiceNow
  if (serviceNowClient.isConfigured()) {
    try {
      const caseInfo = await serviceNowClient.getCase(caseNumber);

      if (caseInfo) {
        const status = caseInfo.state || "Unknown";
        const priority = caseInfo.priority ? `P${caseInfo.priority}` : "";
        const description = caseInfo.short_description || "";

        message += `\n\n`;
        message += `*Status:* ${status}`;
        if (priority) message += ` | *Priority:* ${priority}`;
        if (description) {
          const truncated =
            description.length > 100
              ? description.substring(0, 100) + "..."
              : description;
          message += `\n*Issue:* ${truncated}`;
        }
      }
    } catch (error) {
      console.log(
        `Could not fetch case info for ${caseNumber}:`,
        error instanceof Error ? error.message : error
      );
      // Continue with basic message
    }
  }

  message += `\n\n_I'll track this conversation for knowledge base generation._`;

  return message;
}

/**
 * Add message to existing case threads (when no new case number is mentioned)
 */
async function addMessageToExistingThreads(
  event: GenericMessageEvent
): Promise<void> {
  if (!event.thread_ts) return;

  const contextManager = getContextManager();
  const allContexts = Array.from(
    contextManager["contexts"].values() // Access private field (we're in the same module conceptually)
  );

  // Find contexts matching this thread
  const matchingContexts = allContexts.filter(
    (ctx) => ctx.threadTs === event.thread_ts && ctx.channelId === event.channel
  );

  // Add message to all matching contexts
  for (const context of matchingContexts) {
    contextManager.addMessage(
      context.caseNumber,
      context.channelId,
      context.threadTs,
      {
        user: event.user || "unknown",
        text: event.text || "",
        timestamp: event.ts,
        thread_ts: event.thread_ts,
      }
    );

    // Check if this message indicates resolution
    if (context.isResolved && !context._notified) {
      await notifyResolution(context.caseNumber, context.channelId, context.threadTs);
      // Mark as notified (prevent duplicate notifications)
      context._notified = true;
    }
  }
}

/**
 * Notify when a case appears to be resolved
 */
async function notifyResolution(
  caseNumber: string,
  channelId: string,
  threadTs: string
): Promise<void> {
  try {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `✅ It looks like *${caseNumber}* has been resolved!\n\n_Would you like me to generate a knowledge base article from this conversation? React with ✅ to approve._`,
      unfurl_links: false,
    });
  } catch (error) {
    console.error(`Error notifying resolution for ${caseNumber}:`, error);
  }
}

/**
 * Extract case numbers from text (exported for testing)
 */
export function extractCaseNumbers(text: string): string[] {
  const contextManager = getContextManager();
  return contextManager.extractCaseNumbers(text);
}
