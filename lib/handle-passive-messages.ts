/**
 * Passive message handler for detecting case numbers in Slack channels.
 * Monitors all messages (without @mentions) and tracks case-related conversations.
 */

import type { GenericMessageEvent } from "./slack-event-types";
import { client } from "./slack-utils";
import { getContextManager, type CaseContext } from "./context-manager";
import { serviceNowClient } from "./tools/servicenow";
import { getKBGenerator } from "./services/kb-generator";
import { getKBApprovalManager } from "./handle-kb-approval";
import { getChannelInfo } from "./services/channel-info";
import { getKBStateMachine, KBState } from "./services/kb-state-machine";
import { getCaseQualityAnalyzer, type QualityAssessment } from "./services/case-quality-analyzer";
import {
  generateGatheringQuestions,
  formatGatheringMessage,
  formatFollowUpMessage,
  formatTimeoutMessage,
  formatAbandonmentMessage,
} from "./services/interactive-kb-assistant";

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
  const context = contextManager.getContextSync(caseNumber, threadTs);
  if (!context || context.messages.length > 1) {
    // Already tracking this thread, don't spam
    return;
  }

  // Fetch and store channel info for context (first detection only)
  try {
    const channelInfo = await getChannelInfo(channelId);
    if (channelInfo && context) {
      context.channelName = channelInfo.channelName;
    }
  } catch (error) {
    console.warn(`Could not fetch channel info for ${channelId}:`, error);
    // Continue without channel info
  }

  // First detection - post tracking message
  try {
    const trackingMessage = await buildTrackingMessage(
      caseNumber,
      context?.channelName
    );

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
async function buildTrackingMessage(
  caseNumber: string,
  channelName?: string
): Promise<string> {
  let message = `👀 Watching case *${caseNumber}*`;

  // Add channel context if available
  if (channelName) {
    message += ` in #${channelName}`;
  }

  // Try to fetch basic case info from ServiceNow
  if (serviceNowClient.isConfigured()) {
    try {
      const caseInfo = await serviceNowClient.getCase(caseNumber);

      if (caseInfo) {
        // ServiceNow client now returns extracted string values
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
    console.log(`[Passive Monitor] Adding message to case ${context.caseNumber}, text: "${event.text}"`);

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

    console.log(`[Passive Monitor] After addMessage - isResolved: ${context.isResolved}, _notified: ${context._notified}`);

    // Check if we're in GATHERING state waiting for user response
    const stateMachine = getKBStateMachine();
    const isWaitingForUser = stateMachine.isWaitingForUser(context.caseNumber, context.threadTs);

    if (isWaitingForUser) {
      console.log(`[KB Generation] User response detected for ${context.caseNumber}, processing...`);
      await handleUserResponse(context, event.text || "");
      continue; // Skip resolution check
    }

    // Check if this message indicates resolution
    if (context.isResolved && !context._notified) {
      console.log(`[Passive Monitor] Triggering KB generation for ${context.caseNumber}`);
      await notifyResolution(context.caseNumber, context.channelId, context.threadTs);
      // Mark as notified (prevent duplicate notifications)
      context._notified = true;
    } else {
      console.log(`[Passive Monitor] NOT triggering KB - isResolved: ${context.isResolved}, _notified: ${context._notified}`);
    }
  }
}

/**
 * Handle user response during GATHERING state
 */
async function handleUserResponse(
  context: CaseContext,
  responseText: string
): Promise<void> {
  const stateMachine = getKBStateMachine();
  const caseNumber = context.caseNumber;
  const threadTs = context.threadTs;
  const channelId = context.channelId;

  console.log(`[KB Generation] Processing user response for ${caseNumber}...`);

  // Add response to state machine
  stateMachine.addUserResponse(caseNumber, threadTs, responseText);

  // Fetch case details for re-assessment
  const caseDetails = serviceNowClient.isConfigured()
    ? await serviceNowClient.getCase(caseNumber).catch(() => null)
    : null;

  // Re-assess quality with new information
  const analyzer = getCaseQualityAnalyzer();
  const newAssessment = await analyzer(context, caseDetails);

  stateMachine.storeAssessment(caseNumber, threadTs, newAssessment.score, newAssessment.missingInfo);

  console.log(`[KB Generation] Re-assessment: ${newAssessment.decision} (score: ${newAssessment.score})`);

  // Route based on new quality
  if (newAssessment.decision === "high_quality") {
    // Quality is now sufficient - generate KB
    console.log(`[KB Generation] Quality improved - proceeding to generation`);
    stateMachine.setState(caseNumber, threadTs, KBState.GENERATING);
    await generateAndPostKB(caseNumber, channelId, threadTs, context, caseDetails);

  } else if (stateMachine.hasReachedMaxAttempts(caseNumber, threadTs)) {
    // Max attempts reached - abandon
    console.log(`[KB Generation] Max attempts reached - abandoning`);
    stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);

    const message = formatAbandonmentMessage(caseNumber);
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: message,
      unfurl_links: false,
    });

    stateMachine.remove(caseNumber, threadTs);

  } else {
    // Still insufficient - ask follow-up questions
    console.log(`[KB Generation] Quality still insufficient - asking follow-up questions`);
    stateMachine.incrementAttempt(caseNumber, threadTs);

    const gathering = await generateGatheringQuestions(newAssessment, context, caseNumber);
    const message = formatFollowUpMessage(caseNumber, newAssessment.missingInfo);

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: message,
      unfurl_links: false,
    });

    console.log(`[KB Generation] Posted follow-up questions for ${caseNumber}`);
  }
}

/**
 * Notify when a case appears to be resolved - Multi-stage KB generation with quality assessment
 */
async function notifyResolution(
  caseNumber: string,
  channelId: string,
  threadTs: string
): Promise<void> {
  console.log(`[KB Generation] Starting multi-stage process for ${caseNumber}`);

  const contextManager = getContextManager();
  const context = contextManager.getContextSync(caseNumber, threadTs);

  if (!context) {
    console.log(`[KB Generation] No context found for ${caseNumber}, skipping`);
    return;
  }

  console.log(`[KB Generation] Context found with ${context.messages.length} messages`);

  // Initialize state machine
  const stateMachine = getKBStateMachine();
  stateMachine.initialize(caseNumber, threadTs, channelId);

  try {
    // Stage 1: Assess Quality (using gpt-5-mini for cost efficiency)
    console.log(`[KB Generation] Stage 1: Assessing quality...`);
    const analyzer = getCaseQualityAnalyzer();
    const caseDetails = serviceNowClient.isConfigured()
      ? await serviceNowClient.getCase(caseNumber).catch(() => null)
      : null;

    const assessment = await analyzer(context, caseDetails);

    // Store assessment
    stateMachine.storeAssessment(caseNumber, threadTs, assessment.score, assessment.missingInfo);

    console.log(`[KB Generation] Quality: ${assessment.decision} (score: ${assessment.score})`);
    console.log(`[KB Generation] Reasoning: ${assessment.reasoning}`);

    // Route based on quality
    if (assessment.decision === "high_quality") {
      // Direct to KB generation - we have enough info
      console.log(`[KB Generation] High quality - proceeding directly to generation`);
      stateMachine.setState(caseNumber, threadTs, KBState.GENERATING);
      await generateAndPostKB(caseNumber, channelId, threadTs, context, caseDetails);

    } else if (assessment.decision === "needs_input") {
      // Interactive gathering - ask for more info
      console.log(`[KB Generation] Needs input - starting interactive gathering`);
      stateMachine.setState(caseNumber, threadTs, KBState.GATHERING);
      await startInteractiveGathering(caseNumber, channelId, threadTs, assessment, context);

    } else {
      // Insufficient - just post simple resolution message
      console.log(`[KB Generation] Insufficient quality - skipping KB generation`);
      stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);

      const message = formatAbandonmentMessage(caseNumber);
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: message,
        unfurl_links: false,
      });

      // Clean up
      stateMachine.remove(caseNumber, threadTs);
    }

  } catch (error) {
    console.error(`[KB Generation] ERROR for ${caseNumber}:`, error);
    console.error(`[KB Generation] Stack trace:`, error instanceof Error ? error.stack : "No stack trace");

    // Fallback: simple notification
    try {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `✅ It looks like *${caseNumber}* has been resolved!\n\n_Error during KB generation: ${error instanceof Error ? error.message : "Unknown error"}_`,
        unfurl_links: false,
      });
    } catch (slackError) {
      console.error(`[KB Generation] Failed to post error notification:`, slackError);
    }

    // Clean up state
    stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);
    stateMachine.remove(caseNumber, threadTs);
  }
}

/**
 * Stage 2a: Generate and post KB article (high quality path)
 */
async function generateAndPostKB(
  caseNumber: string,
  channelId: string,
  threadTs: string,
  context: CaseContext,
  caseDetails: any | null
): Promise<void> {
  console.log(`[KB Generation] Generating KB article for ${caseNumber}...`);

  const kbGenerator = getKBGenerator();
  const result = await kbGenerator.generateArticle(context, caseDetails);

  if (result.isDuplicate) {
    // Similar KB exists - notify and skip
    const similarKBs = result.similarExistingKBs
      ?.map((kb: any) => `• <${kb.url}|${kb.number}>: ${kb.title}`)
      .join("\n") || "";

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `✅ *${caseNumber}* is resolved!\n\nℹ️ Similar KB articles already exist:\n${similarKBs}\n\n_Consider updating an existing article instead of creating a new one._`,
      unfurl_links: false,
    });

    const stateMachine = getKBStateMachine();
    stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);
    stateMachine.remove(caseNumber, threadTs);
    return;
  }

  // Post KB article for approval
  const message = await buildKBApprovalMessage(caseNumber, result.article, result.confidence);
  const kbApprovalManager = getKBApprovalManager();

  await kbApprovalManager.postForApproval(
    caseNumber,
    channelId,
    threadTs,
    result.article,
    message
  );

  const stateMachine = getKBStateMachine();
  stateMachine.setState(caseNumber, threadTs, KBState.PENDING_APPROVAL);
  console.log(`[KB Generation] Posted KB for approval: ${caseNumber}`);
}

/**
 * Stage 2b: Start interactive gathering (needs input path)
 */
async function startInteractiveGathering(
  caseNumber: string,
  channelId: string,
  threadTs: string,
  assessment: QualityAssessment,
  context: CaseContext
): Promise<void> {
  console.log(`[KB Generation] Starting interactive gathering for ${caseNumber}...`);

  const stateMachine = getKBStateMachine();
  stateMachine.incrementAttempt(caseNumber, threadTs);

  // Generate contextual questions using GPT-4o
  const gathering = await generateGatheringQuestions(assessment, context, caseNumber);

  // Post gathering message to Slack
  const message = formatGatheringMessage(caseNumber, gathering);

  await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: message,
    unfurl_links: false,
  });

  console.log(`[KB Generation] Posted ${gathering.questions.length} questions for ${caseNumber}`);
}

/**
 * Build KB approval message with article preview
 */
async function buildKBApprovalMessage(
  caseNumber: string,
  article: any,
  confidence: number
): Promise<string> {
  let message = `✅ *${caseNumber}* is resolved! I've generated a KB article draft:\n\n`;
  message += `*${article.title}*\n\n`;
  message += `${article.problem.substring(0, 200)}${article.problem.length > 200 ? "..." : ""}\n\n`;
  message += `_Confidence: ${confidence}% | React with ✅ to publish or ❌ to skip_`;
  return message;
}

/**
 * Check for and handle timed-out KB gathering sessions
 */
export async function cleanupTimedOutGathering(): Promise<void> {
  const stateMachine = getKBStateMachine();

  // Get all contexts in GATHERING state
  const gatheringContexts = stateMachine.getContextsInState(KBState.GATHERING);

  const now = new Date();
  const timeoutMs = 24 * 60 * 60 * 1000; // 24 hours

  for (const ctx of gatheringContexts) {
    const elapsedMs = now.getTime() - ctx.lastUpdated.getTime();

    if (elapsedMs > timeoutMs) {
      console.log(`[KB Generation] Timing out gathering for ${ctx.caseNumber} (${Math.round(elapsedMs / 3600000)}h elapsed)`);

      // Post timeout message
      const message = formatTimeoutMessage(ctx.caseNumber);

      try {
        await client.chat.postMessage({
          channel: ctx.channelId,
          thread_ts: ctx.threadTs,
          text: message,
          unfurl_links: false,
        });
      } catch (error) {
        console.error(`[KB Generation] Failed to post timeout message for ${ctx.caseNumber}:`, error);
      }

      // Update state and cleanup
      stateMachine.setState(ctx.caseNumber, ctx.threadTs, KBState.ABANDONED);
      stateMachine.remove(ctx.caseNumber, ctx.threadTs);
    }
  }
}

// Run timeout cleanup every hour
setInterval(() => {
  cleanupTimedOutGathering().catch(error => {
    console.error('[KB Generation] Error during timeout cleanup:', error);
  });
}, 60 * 60 * 1000);

/**
 * Extract case numbers from text (exported for testing)
 */
export function extractCaseNumbers(text: string): string[] {
  const contextManager = getContextManager();
  return contextManager.extractCaseNumbers(text);
}
