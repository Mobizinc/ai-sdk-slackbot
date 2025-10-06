import type {
  GenericMessageEvent,
  SlackEvent,
} from "../lib/slack-event-types";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId } from "../lib/slack-utils";
import { assistantManager } from "../lib/assistant-manager";

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
      waitUntil(handleNewAppMention(event, botUserId));
    }

    if (event.type === "assistant_thread_started") {
      waitUntil(assistantManager.handleThreadStarted(event));
    }

    if (event.type === "assistant_thread_context_changed") {
      assistantManager.handleThreadContextChanged(event);
    }

    if (event.type === "message") {
      const messageEvent = event as GenericMessageEvent;
      const isThreadReply =
        !!messageEvent.thread_ts && messageEvent.thread_ts !== messageEvent.ts;
      const isDirectMessage = messageEvent.channel_type === "im";

      if (
        !messageEvent.subtype &&
        (isDirectMessage || isThreadReply) &&
        !messageEvent.bot_id &&
        !messageEvent.bot_profile &&
        messageEvent.bot_id !== botUserId
      ) {
        waitUntil(assistantManager.handleUserMessage(messageEvent, botUserId));
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
