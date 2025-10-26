import type { ChatMessage } from "./agent/types";
import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "./slack-event-types";
import { getSlackMessagingService } from "./services/slack-messaging";
import { generateResponse } from "./generate-response";

const slackMessaging = getSlackMessagingService();

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
) {
  const { channel_id, thread_ts } = event.assistant_thread;
  console.log(`Thread started: ${channel_id} ${thread_ts}`);
  console.log(JSON.stringify(event));

  await slackMessaging.postMessage({
    channel: channel_id,
    threadTs: thread_ts,
    text: "Hello, I'm an AI assistant built with the AI SDK by Vercel!",
  });
  try {
    await slackMessaging.setAssistantSuggestedPrompts({
      channelId: channel_id,
      threadTs: thread_ts,
      prompts: [
        {
          title: "Get the weather",
          message: "What is the current weather in London?",
        },
        {
          title: "Get the news",
          message: "What is the latest Premier League news from the BBC?",
        },
      ],
    });
  } catch (error) {
    const slackError =
      typeof error === "object" && error !== null ? (error as any) : null;
    const apiError = slackError?.data?.error ?? slackError?.message;
    const apiErrorString = String(apiError ?? "");
    if (
      apiErrorString === "missing_scope" ||
      apiErrorString === "method_not_supported_for_channel_type" ||
      apiErrorString.includes("missing_scope") ||
      apiErrorString.includes("method_not_supported_for_channel_type")
    ) {
      console.warn("Skipping assistant suggested prompts", apiErrorString);
    } else {
      throw error;
    }
  }
}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string,
  options?: {
    threadContext?: {
      threadTs: string;
      channelId: string;
      context?: Record<string, unknown> | null;
      previousContext?: Record<string, unknown> | null;
    };
  },
) {
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
    return;

  const { thread_ts, channel } = event;
  const updateStatus = updateStatusUtil(channel, thread_ts);
  try {
    await updateStatus("is thinking...");

    let messages: ChatMessage[];

    try {
      messages = await getThread(channel, thread_ts, botUserId);
    } catch (threadError) {
      const slackError =
        typeof threadError === "object" && threadError !== null
          ? (threadError as any)
          : null;
      const apiError = slackError?.data?.error ?? slackError?.message;
      const apiErrorString = String(apiError ?? "");

      if (
        apiErrorString === "missing_scope" ||
        apiErrorString.includes("missing_scope")
      ) {
        console.warn(
          "Falling back to single message context due to missing_scope for conversations.replies",
        );
        if (options?.threadContext) {
          console.warn(
            "Thread context at time of fallback",
            JSON.stringify(options.threadContext),
          );
        }
        const cleanedText = event.text
          ? event.text.replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "").trim()
          : "";
        messages = [
          {
            role: "user",
            content: cleanedText || event.text || "",
          },
        ];
      } else {
        throw threadError;
      }
    }

    const result = await generateResponse(messages, updateStatus, {
      channelId: channel,
      threadTs: thread_ts,
    });

    await slackMessaging.postMessage({
      channel: channel,
      threadTs: thread_ts,
      text: result,
      unfurlLinks: false,
    });
  } catch (error) {
    console.error("Error generating assistant response", error);
    const errorMessage =
      (error instanceof Error ? error.message : "Unexpected error")
        .slice(0, 180);
    await slackMessaging.postMessage({
      channel: channel,
      threadTs: thread_ts,
      text:
        "Sorry, I ran into a problem fetching that answer. Please try asking again in a moment. (" +
        errorMessage +
        ")",
    });
  } finally {
    await updateStatus("");
  }
}
