import { getSlackMessagingService } from "../../../../lib/services/slack-messaging";
import { authorizeAdminRequest, getCorsHeaders } from "../../utils";

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const slack = getSlackMessagingService();
    const channels = await slack.listChannels();
    return new Response(JSON.stringify({ channels }), { status: 200, headers: getCorsHeaders(request) });
  } catch (error) {
    console.error("[AdminAPI] Failed to list Slack channels", error);
    return new Response(
      JSON.stringify({ error: "Failed to list Slack channels", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: getCorsHeaders(request) },
    );
  }
}

