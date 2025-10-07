/**
 * Passive message handler for detecting case numbers in Slack channels.
 * Monitors all messages (without @mentions) and tracks case-related conversations.
 */

import type { GenericMessageEvent } from "./slack-event-types";
import { client } from "./slack-utils";
import { getContextManager } from "./context-manager";
import { serviceNowClient } from "./tools/servicenow";
import { getKBGenerator } from "./services/kb-generator";
import { getKBApprovalManager } from "./handle-kb-approval";

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
 * Notify when a case appears to be resolved and generate KB article
 */
async function notifyResolution(
  caseNumber: string,
  channelId: string,
  threadTs: string
): Promise<void> {
  const contextManager = getContextManager();
  const context = contextManager.getContext(caseNumber, threadTs);

  if (!context) {
    console.log(`No context found for ${caseNumber}, skipping KB generation`);
    return;
  }

  try {
    // Step 1: Generate KB article
    const kbGenerator = getKBGenerator();
    const caseDetails = serviceNowClient.isConfigured()
      ? await serviceNowClient.getCase(caseNumber).catch(() => null)
      : null;

    const result = await kbGenerator.generateArticle(context, caseDetails);

    // Step 2: Check if similar KBs exist
    if (result.isDuplicate) {
      // Similar KB exists - just notify
      const warningMessage = kbGenerator.formatSimilarKBsWarning(
        result.similarExistingKBs
      );

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `✅ Case *${caseNumber}* appears to be resolved!\n\n${warningMessage}`,
        unfurl_links: false,
      });

      return;
    }

    // Step 3: Post KB article proposal
    const kbMessage = kbGenerator.formatForSlack(result.article);
    const confidenceEmoji = result.confidence >= 75 ? "🟢" : result.confidence >= 50 ? "🟡" : "🟠";

    let fullMessage = `✅ Case *${caseNumber}* appears to be resolved!\n\n`;
    fullMessage += kbMessage;
    fullMessage += `\n\n${confidenceEmoji} *Confidence:* ${result.confidence}%\n\n`;
    fullMessage += `_React with ✅ to approve this KB article, or ❌ to reject it._`;

    if (result.similarExistingKBs.length > 0) {
      fullMessage += `\n\n📎 *Related:* ${result.similarExistingKBs.map(kb => kb.case_number).join(", ")}`;
    }

    const response = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: fullMessage,
      unfurl_links: false,
    });

    // Step 4: Store for approval tracking
    if (response.ts) {
      const approvalManager = getKBApprovalManager();
      approvalManager.storePendingApproval(
        response.ts,
        channelId,
        caseNumber,
        result.article,
        threadTs
      );
    }
  } catch (error) {
    console.error(`Error generating KB for ${caseNumber}:`, error);

    // Fallback: simple notification
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `✅ It looks like *${caseNumber}* has been resolved!\n\n_Error generating KB article: ${error instanceof Error ? error.message : "Unknown error"}_`,
      unfurl_links: false,
    });
  }
}

/**
 * Extract case numbers from text (exported for testing)
 */
export function extractCaseNumbers(text: string): string[] {
  const contextManager = getContextManager();
  return contextManager.extractCaseNumbers(text);
}
