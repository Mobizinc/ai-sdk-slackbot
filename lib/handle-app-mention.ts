import type { AppMentionEvent } from "./slack-event-types";
import { getSlackMessagingService } from "./services/slack-messaging";
import { generateResponse } from "./agent";
import { getContextManager } from "./context-manager";
import { notifyResolution } from "./handle-passive-messages";
import { serviceNowClient } from "./tools/servicenow";
import { getCaseTriageService } from "./services/case-triage";
import { getServiceNowContextFromEvent } from "./infrastructure/servicenow-context";

const SLACK_DISPLAY_TEXT_LIMIT = 12000;

const clampTextForSlackDisplay = (text: string): string => {
  if (!text) return text;
  if (text.length <= SLACK_DISPLAY_TEXT_LIMIT) {
    return text;
  }
  return `${text.slice(0, SLACK_DISPLAY_TEXT_LIMIT - 1)}…`;
};

const slackMessaging = getSlackMessagingService();

const extractSummaryText = (raw: unknown): string | null => {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.text === "string") {
        return parsed.text.trim();
      }
    } catch {
      // Ignore parse errors and fall through to returning original trimmed text
    }
  }

  return trimmed;
};

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
  // Create initial message with dedicated status block
  const initialMessage = await slackMessaging.postMessage({
    channel: event.channel,
    threadTs: event.thread_ts ?? event.ts,
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

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const statusEmojis: Record<string, string> = {
    'is thinking...': '⏳',
    'thinking': '⏳',
    'calling-tool': '🔧',
    'is looking up': '🔍',
    'is searching': '🔎',
    'is fetching': '📥',
    'analyzing': '🧠',
    'is gathering': '📊',
  };

  // Non-destructive status update - only updates the status block
  const updateStatus = async (status: string) => {
    // Find matching emoji
    const emojiKey = Object.keys(statusEmojis).find(key => status.includes(key)) || '';
    const emoji = statusEmojis[emojiKey] || '⚙️';

    await slackMessaging.updateMessage({
      channel: event.channel,
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
      const { splitTextIntoSectionBlocks } = await import("./formatters/servicenow-block-kit");
      finalBlocks = splitTextIntoSectionBlocks(displayText, "mrkdwn");
    }

    await slackMessaging.updateMessage({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: displayText,
      blocks: finalBlocks,
    });
  };

  return { updateStatus, setFinalMessage };
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  console.log("Handling app mention");
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel } = event;
  const { updateStatus, setFinalMessage } = await updateStatusUtil("is thinking...", event);

  // Check for triage command pattern: @botname triage [case_number]
  // Supported patterns:
  // - @bot triage SCS0001234
  // - @bot triage case SCS0001234
  // - @bot classify SCS0001234
  // - @bot analyze SCS0001234
  const triageKeywordPattern = /(?:triage|classify|analyze)(?:\s+case)?\s+((?:SCS|CS|INC|RITM|REQ|CHG|PRB|SCTASK|STASK)[0-9]{7,10})/i;
  const triageMatch = event.text.match(triageKeywordPattern);

  if (triageMatch) {
    const caseNumber = triageMatch[1].toUpperCase();
    console.log(`[App Mention] Detected triage command for case ${caseNumber}`);

    try {
      await updateStatus(`is triaging case ${caseNumber}...`);

      // Fetch case from ServiceNow
      if (!serviceNowClient.isConfigured()) {
        await setFinalMessage("ServiceNow integration is not configured. Cannot triage cases.");
        return;
      }

      // Extract context for deterministic feature flag routing
      const context = getServiceNowContextFromEvent(event);

      const caseDetails = await serviceNowClient.getCase(caseNumber, context);

      if (!caseDetails) {
        await setFinalMessage(`Case ${caseNumber} not found in ServiceNow. Please verify the case number is correct.`);
        return;
      }

      // Perform triage
      const caseTriageService = getCaseTriageService();
      const triageResult = await caseTriageService.triageCase(
        {
          case_number: caseDetails.number,
          sys_id: caseDetails.sys_id,
          short_description: caseDetails.short_description || "",
          description: caseDetails.description,
          priority: caseDetails.priority,
          urgency: caseDetails.priority, // Use priority as urgency since urgency isn't in ServiceNowCaseResult
          state: caseDetails.state,
          category: caseDetails.category,
          subcategory: caseDetails.subcategory,
          assignment_group: caseDetails.assignment_group,
          assignment_group_sys_id: caseDetails.assignment_group, // Use assignment_group since sys_id version isn't available
          assigned_to: caseDetails.assigned_to,
          caller_id: caseDetails.caller_id,
          company: caseDetails.caller_id, // Use caller_id as company fallback
          account_id: undefined, // Not available in ServiceNowCaseResult
        },
        {
          enableCaching: true,
          enableSimilarCases: true,
          enableKBArticles: true,
          enableBusinessContext: true,
          enableWorkflowRouting: true,
          writeToServiceNow: false, // Don't write from @mention (manual triage is read-only)
        }
      );

      // Format response
      const classification = triageResult.classification;
      const confidencePercent = Math.round((classification.confidence_score || 0) * 100);

      let response = `*Triage Results for ${caseNumber}*\n\n`;
      response += `*Classification:* ${classification.category}`;
      if (classification.subcategory) {
        response += ` > ${classification.subcategory}`;
      }
      response += `\n*Confidence:* ${confidencePercent}%\n`;
      response += `*Urgency Level:* ${classification.urgency_level || 'N/A'}\n\n`;

      if (classification.quick_summary) {
        response += `*Summary:* ${classification.quick_summary}\n\n`;
      }

      if (classification.immediate_next_steps && classification.immediate_next_steps.length > 0) {
        response += `*Immediate Next Steps:*\n`;
        classification.immediate_next_steps.forEach((step, idx) => {
          response += `${idx + 1}. ${step}\n`;
        });
        response += `\n`;
      }

      if (triageResult.similarCases && triageResult.similarCases.length > 0) {
        response += `*Similar Cases Found:* ${triageResult.similarCases.length}\n`;
        triageResult.similarCases.slice(0, 3).forEach((sc) => {
          const similarity = Math.round(sc.similarity_score * 100);
          response += `• ${sc.case_number} (${similarity}% match)\n`;
        });
        response += `\n`;
      }

      if (triageResult.kbArticles && triageResult.kbArticles.length > 0) {
        response += `*Relevant KB Articles Found:* ${triageResult.kbArticles.length}\n`;
        triageResult.kbArticles.slice(0, 3).forEach((kb) => {
          const relevance = Math.round(kb.similarity_score * 10); // similarity_score is 0-10, normalize to percentage
          response += `• ${kb.kb_number}: ${kb.title?.substring(0, 60)}... (${relevance}% relevant)\n`;
        });
        response += `\n`;
      }

      if (triageResult.recordTypeSuggestion) {
        const suggestion = triageResult.recordTypeSuggestion;
        response += `\n*Record Type Recommendation:* ${suggestion.type}`;
        if (suggestion.is_major_incident) {
          response += ` ⚠️ *MAJOR INCIDENT*`;
        }
        response += `\n_${suggestion.reasoning}_\n`;
      }

      response += `\n_Processing time: ${triageResult.processingTimeMs}ms`;
      if (triageResult.cached) {
        response += ` (cached)`;
      }
      response += `_`;

      await setFinalMessage(response);
      return;

    } catch (error) {
      console.error(`[App Mention] Triage failed for ${caseNumber}:`, error);
      await setFinalMessage(`Failed to triage case ${caseNumber}. ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }
  }

  // If not a triage command, proceed with normal AI response
  let result: string;
  if (thread_ts) {
    const messages = await slackMessaging.getThread(channel, thread_ts, botUserId);
    result = await generateResponse(messages, updateStatus, {
      channelId: channel,
      threadTs: thread_ts,
    });
  } else {
    result = await generateResponse(
      [{ role: "user", content: event.text }],
      updateStatus,
      {
        channelId: channel,
        threadTs: thread_ts ?? event.ts,
      },
    );
  }

  // Extract plain text from result (handle JSON-wrapped responses)
  const plainText = extractSummaryText(result) || result;
  await setFinalMessage(plainText);

  // After responding, check for case numbers and trigger intelligent workflow
  const contextManager = getContextManager();
  const caseNumbers = contextManager.extractCaseNumbers(event.text);

  if (caseNumbers.length > 0) {
    const actualThreadTs = thread_ts || event.ts; // Use event.ts as thread if not in thread

    for (const caseNumber of caseNumbers) {
      // Add message to context for tracking
      contextManager.addMessage(caseNumber, channel, actualThreadTs, {
        user: event.user || "unknown",
        text: event.text || "",
        timestamp: event.ts,
        thread_ts: thread_ts,
      });

      // Check if case is resolved
      const context = contextManager.getContextSync(caseNumber, actualThreadTs);

      // Extract ServiceNow context for feature flag routing
      const snContext = getServiceNowContextFromEvent(event);

      // Check ServiceNow state
      let isResolvedInServiceNow = false;
      if (serviceNowClient.isConfigured()) {
        try {
          const caseDetails = await serviceNowClient.getCase(caseNumber, snContext);
          if (caseDetails?.state?.toLowerCase().includes("closed") ||
              caseDetails?.state?.toLowerCase().includes("resolved")) {
            isResolvedInServiceNow = true;
          }
        } catch (error) {
          console.log(`[App Mention] Could not fetch case ${caseNumber}:`, error);
        }
      }

      // Trigger KB workflow only if BOTH conversation AND ServiceNow agree it's resolved
      // OR if ServiceNow is not configured (rely on conversation only)
      if (context && !context._notified) {
        const shouldTriggerKB = (context.isResolved || isResolvedInServiceNow) &&
                                (!serviceNowClient.isConfigured() || isResolvedInServiceNow);

        if (shouldTriggerKB) {
          console.log(`[App Mention] Case ${caseNumber} is resolved, triggering KB workflow (ServiceNow confirmed: ${isResolvedInServiceNow})`);
          // Fire and forget - don't block the response
          notifyResolution(caseNumber, channel, actualThreadTs).catch((err) => {
            console.error(`[App Mention] Error in notifyResolution for ${caseNumber}:`, err);
          });
          context._notified = true;
        } else if (context.isResolved && !isResolvedInServiceNow) {
          console.log(`[App Mention] Skipping KB workflow - conversation suggests resolution but ServiceNow state doesn't confirm it yet`);
          // Reset isResolved flag since ServiceNow doesn't confirm
          context.isResolved = false;
        }
      }
    }
  }
}
