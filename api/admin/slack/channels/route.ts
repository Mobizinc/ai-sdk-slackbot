import { config as runtimeConfig } from "../../../../lib/config";
import { getSlackMessagingService } from "../../../../lib/services/slack-messaging";

function buildUnauthorizedResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

function authorize(request: Request): Response | null {
  const isDevelopment = !runtimeConfig.vercelEnv || runtimeConfig.vercelEnv === "development";
  if (isDevelopment) return null;

  const adminToken = runtimeConfig.adminApiToken;
  if (!adminToken) {
    return buildUnauthorizedResponse("Admin API disabled; set ADMIN_API_TOKEN", 403);
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return buildUnauthorizedResponse("Unauthorized. Provide Bearer token.", 401);
  }

  const provided = authHeader.substring(7);
  if (provided !== adminToken) {
    return buildUnauthorizedResponse("Forbidden. Invalid admin token.", 403);
  }

  return null;
}

const corsHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  try {
    const slack = getSlackMessagingService();
    const channels = await slack.listChannels();
    return new Response(JSON.stringify({ channels }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("[AdminAPI] Failed to list Slack channels", error);
    return new Response(
      JSON.stringify({ error: "Failed to list Slack channels", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: corsHeaders },
    );
  }
}

