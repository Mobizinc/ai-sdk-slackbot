import type { AppMentionEvent } from "./slack-event-types";
import { client, getThread } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { getContextManager } from "./context-manager";
import { notifyResolution } from "./handle-passive-messages";
import { serviceNowClient } from "./tools/servicenow";

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
  const initialMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await client.chat.update({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
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
  const updateMessage = await updateStatusUtil("is thinking...", event);

  // Generate response first
  let result: string;
  if (thread_ts) {
    const messages = await getThread(channel, thread_ts, botUserId);
    result = await generateResponse(messages, updateMessage, {
      channelId: channel,
      threadTs: thread_ts,
    });
  } else {
    result = await generateResponse(
      [{ role: "user", content: event.text }],
      updateMessage,
      {
        channelId: channel,
        threadTs: thread_ts ?? event.ts,
      },
    );
  }

  await updateMessage(result);

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

      // Check ServiceNow state
      let isResolvedInServiceNow = false;
      if (serviceNowClient.isConfigured()) {
        try {
          const caseDetails = await serviceNowClient.getCase(caseNumber);
          if (caseDetails?.state?.toLowerCase().includes("closed") ||
              caseDetails?.state?.toLowerCase().includes("resolved")) {
            isResolvedInServiceNow = true;
          }
        } catch (error) {
          console.log(`[App Mention] Could not fetch case ${caseNumber}:`, error);
        }
      }

      // Trigger KB workflow if resolved (either by keyword or ServiceNow state)
      if (context && (context.isResolved || isResolvedInServiceNow) && !context._notified) {
        console.log(`[App Mention] Case ${caseNumber} is resolved, triggering KB workflow`);
        // Fire and forget - don't block the response
        notifyResolution(caseNumber, channel, actualThreadTs).catch((err) => {
          console.error(`[App Mention] Error in notifyResolution for ${caseNumber}:`, err);
        });
        context._notified = true;
      }
    }
  }
}
