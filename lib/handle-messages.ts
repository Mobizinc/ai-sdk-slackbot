import type { ChatMessage } from "./agent/types";
import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "./slack-event-types";
import { getSlackMessagingService } from "./services/slack-messaging";
import { generateResponse } from "./agent";
import { withLangSmithTrace } from "./observability";
import { postErrorToSlack } from "./utils/slack-error-handler";

const slackMessaging = getSlackMessagingService();

export const assistantThreadMessage = withLangSmithTrace(
  async (event: AssistantThreadStartedEvent) => {
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
  },
  {
    name: "assistant_thread_message",
    runType: "chain",
    tags: {
      component: "slack-handler",
      operation: "thread_start",
    },
  }
);

export const handleNewAssistantMessage = withLangSmithTrace(
  async (
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
  ) => {
    if (
      event.bot_id ||
      event.bot_id === botUserId ||
      event.bot_profile ||
      !event.thread_ts
    )
      return;

    const { thread_ts, channel } = event;
    const updateStatus = slackMessaging.createStatusUpdater(channel, thread_ts);
    try {
      await updateStatus("is thinking...");

      let messages: ChatMessage[];

      try {
        messages = await slackMessaging.getThread(channel, thread_ts, botUserId);
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
      await postErrorToSlack({
        channel,
        threadTs: thread_ts,
        error,
        errorPrefix: "Sorry, I ran into a problem fetching that answer",
        logContext: "[Assistant Message]",
      });
    } finally {
      await updateStatus("");
    }
  },
  {
    name: "handle_new_assistant_message",
    runType: "chain",
    metadata: (event) => ({
      channelId: event?.channel,
      threadTs: event?.thread_ts,
      userId: event?.user,
      messageId: event?.ts,
      eventType: event?.type,
    }),
    tags: {
      component: "slack-handler",
      operation: "message_received",
    },
  }
);
