import type { ChatPostMessageArguments } from "@slack/web-api";
import { z } from "zod";

import { client } from "../lib/slack-utils";
import { verifyRelaySignature } from "../lib/relay-auth";

const targetSchema = z
  .object({
    channel: z.string().min(1, "target.channel is required").optional(),
    user: z.string().min(1, "target.user cannot be empty").optional(),
    thread_ts: z.string().min(1, "target.thread_ts cannot be empty").optional(),
    reply_broadcast: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.channel && !value.user) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either target.channel or target.user",
        path: ["channel"],
      });
    }
  });

const messageSchema = z
  .object({
    text: z.string().optional(),
    blocks: z.array(z.unknown()).optional(),
    attachments: z.array(z.unknown()).optional(),
    unfurl_links: z.boolean().optional(),
    unfurl_media: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const trimmedText = value.text?.trim();
    if (!trimmedText && !value.blocks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "message.text or message.blocks is required",
        path: ["text"],
      });
    }
    if (typeof value.text === "string" && trimmedText?.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "message.text cannot be empty",
        path: ["text"],
      });
    }
  });

const metadataSchema = z
  .object({
    correlationId: z.string().max(128).optional(),
    eventType: z.string().max(64).optional(),
    payload: z.record(z.unknown()).optional(),
  })
  .optional();

const inboundRelaySchema = z.object({
  target: targetSchema,
  message: messageSchema,
  source: z.string().max(128).optional(),
  metadata: metadataSchema,
});

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(extraHeaders ?? {}),
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  const signatureResult = verifyRelaySignature({
    headers: request.headers,
    rawBody,
  });

  if (!signatureResult.ok) {
    return jsonResponse(
      { error: signatureResult.message },
      signatureResult.status,
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400);
  }

  const validationResult = inboundRelaySchema.safeParse(parsedBody);
  if (!validationResult.success) {
    return jsonResponse(
      {
        error: "Invalid relay payload",
        details: validationResult.error.flatten(),
      },
      400,
    );
  }

  const { target, message, metadata, source } = validationResult.data;

  let channelId = target.channel;
  let threadTs = target.thread_ts;

  try {
    if (!channelId && target.user) {
      const dm = await client.conversations.open({ users: target.user });
      channelId = dm.channel?.id ?? undefined;
      if (!channelId) {
        return jsonResponse(
          { error: "Unable to open conversation for target.user" },
          404,
        );
      }
    }

    if (!channelId) {
      return jsonResponse(
        { error: "Unable to resolve target channel" },
        400,
      );
    }

    const text = message.text?.trim();

    // Build payload with relaxed typing to handle optional blocks/attachments
    const postPayload: any = {
      channel: channelId,
      text: text ?? (source ? `Relay from ${source}` : "Relay message"),
      unfurl_links: message.unfurl_links,
      unfurl_media: message.unfurl_media,
    };

    if (threadTs) {
      postPayload.thread_ts = threadTs;
    }

    // reply_broadcast can only be true (not false) per Slack API types
    if (target.reply_broadcast === true) {
      postPayload.reply_broadcast = true;
    }

    if (message.blocks) {
      postPayload.blocks = message.blocks;
    }

    if (message.attachments) {
      postPayload.attachments = message.attachments;
    }

    if (metadata || source) {
      const eventType = metadata?.eventType ?? "relay.message";
      const eventPayload = {
        ...(metadata?.payload ?? {}),
        ...(metadata?.correlationId
          ? { correlationId: metadata.correlationId }
          : {}),
        ...(source ? { source } : {}),
      };

      // MessageMetadata always requires event_payload
      postPayload.metadata = {
        event_type: eventType,
        event_payload: eventPayload,
      };
    }

    const response = await client.chat.postMessage(postPayload);

    if (!response.ok) {
      const error =
        (response.error as string | undefined) ?? "Slack did not accept the message";
      return jsonResponse({ error }, 502);
    }

    if (!threadTs) {
      threadTs = response.ts ?? undefined;
    }

    return jsonResponse(
      {
        ok: true,
        channel: response.channel ?? channelId,
        ts: response.ts,
        thread_ts: threadTs,
      },
      200,
    );
  } catch (error) {
    console.error("Failed to relay message", error);
    return jsonResponse({ error: "Failed to relay message" }, 502);
  }
}

export async function GET() {
  return jsonResponse(
    {
      message: "Relay endpoint expects authenticated POST requests",
    },
    405,
    { allow: "POST" },
  );
}
