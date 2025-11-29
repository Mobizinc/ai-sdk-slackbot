import { getSlackMessagingService } from "../../../../lib/services/slack-messaging";
import { authorizeAdminRequest, getCorsHeaders } from "../../utils";

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return new Response(JSON.stringify({ error: "channelId is required" }), { status: 400, headers: getCorsHeaders(request) });
  }

  try {
    const slack = getSlackMessagingService();
    const info = await slack.getChannelInfo(channelId);
    return new Response(JSON.stringify({ ok: true, channel: info }), { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    console.error("[AdminAPI] Failed to validate Slack channel", error);
    return new Response(
      JSON.stringify({
        error: "Failed to validate Slack channel",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: getCorsHeaders(request) },
    );
  }
}
