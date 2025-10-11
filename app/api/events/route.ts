import type {
  GenericMessageEvent,
  ReactionAddedEvent,
  SlackEvent,
} from "../../../lib/slack-event-types";
import { enqueueBackgroundTask } from "../../../lib/background-tasks";
import { handleNewAppMention } from "../../../lib/handle-app-mention";
import { verifyRequest, getBotId } from "../../../lib/slack-utils";
import { assistantManager } from "../../../lib/assistant-manager";
import { handlePassiveMessage } from "../../../lib/handle-passive-messages";
import { getKBApprovalManager } from "../../../lib/handle-kb-approval";
import { getContextUpdateManager } from "../../../lib/context-update-manager";
import { initializeDatabase } from "../../../lib/db/init";

// Route segment config - set max duration for Vercel serverless function
export const maxDuration = 60;

// Initialize database on cold start (module load)
initializeDatabase().catch((err) => {
  console.error("[Startup] Database initialization failed:", err);
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  const requestType = payload.type as "url_verification" | "event_callback";

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    return new Response(payload.challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  await verifyRequest({ requestType, request, rawBody });

  try {
    const botUserId = await getBotId();

    const event = payload.event as SlackEvent;

    if (event.type === "app_mention") {
      enqueueBackgroundTask(handleNewAppMention(event, botUserId));
    }

    if (event.type === "assistant_thread_started") {
      enqueueBackgroundTask(assistantManager.handleThreadStarted(event));
    }

    if (event.type === "assistant_thread_context_changed") {
      assistantManager.handleThreadContextChanged(event);
    }

    if (event.type === "message") {
      const messageEvent = event as GenericMessageEvent;
      const isThreadReply =
        !!messageEvent.thread_ts && messageEvent.thread_ts !== messageEvent.ts;
      const isDirectMessage = messageEvent.channel_type === "im";

      // Handle direct messages with the assistant
      // Thread replies are handled by passive monitoring and @mentions only
      if (
        !messageEvent.subtype &&
        isDirectMessage &&
        !messageEvent.bot_id &&
        !messageEvent.bot_profile &&
        messageEvent.bot_id !== botUserId
      ) {
        enqueueBackgroundTask(
          assistantManager.handleUserMessage(messageEvent, botUserId),
        );
      }

      // Passive monitoring: scan ALL channel messages for case numbers
      // This runs in parallel and doesn't interfere with assistant messages
      if (!messageEvent.subtype && !messageEvent.bot_id) {
        enqueueBackgroundTask(handlePassiveMessage(messageEvent, botUserId));
      }
    }

    if (event.type === "reaction_added") {
      const reactionEvent = event as ReactionAddedEvent;

      // Handle KB approval/rejection via emoji reactions
      if (reactionEvent.item.type === "message") {
        const approvalManager = getKBApprovalManager();
        enqueueBackgroundTask(
          approvalManager.handleReaction(
            reactionEvent.item.channel,
            reactionEvent.item.ts,
            reactionEvent.reaction,
            reactionEvent.user,
          ),
        );

        const contextUpdateManager = getContextUpdateManager();
        enqueueBackgroundTask(
          contextUpdateManager.handleReaction(
            reactionEvent.item.channel,
            reactionEvent.item.ts,
            reactionEvent.reaction,
            reactionEvent.user,
          ),
        );
      }
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge");

  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new Response(
    JSON.stringify({
      message: "Slack Events endpoint expects POST requests from Slack",
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json",
        allow: "POST",
      },
    },
  );
}
