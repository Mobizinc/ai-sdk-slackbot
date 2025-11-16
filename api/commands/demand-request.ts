import { verifyRequest } from "../../lib/slack-utils";
import { fetchDemandSchema } from "../../lib/services/demand-workflow-service";
import { openDemandRequestModal } from "../../lib/demand/slack-workflow";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = await verifyRequest({
    requestType: "command",
    request,
    rawBody,
  });

  if (verification instanceof Response) {
    return verification;
  }

  const params = new URLSearchParams(rawBody);
  const triggerId = params.get("trigger_id");
  const channelId = params.get("channel_id");
  const userId = params.get("user_id");
  const userName = params.get("user_name") ?? undefined;

  if (!triggerId || !channelId || !userId) {
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Missing Slack command metadata. Please try again.",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  try {
    const schema = await fetchDemandSchema();
    await openDemandRequestModal(triggerId, schema, {
      channelId,
      userId,
      userName,
      commandText: params.get("text") ?? undefined,
    });

    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Opening demand request form…",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[Demand] Failed to open modal:", error);
    const message =
      error instanceof Error ? error.message : "Unable to open demand form.";
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: `Unable to start demand request: ${message}`,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
