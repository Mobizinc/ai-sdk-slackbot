import { config as runtimeConfig } from "../../../../../../lib/config";
import {
  fetchStandupById,
  fetchStandupResponses,
  createStandup,
} from "../../../../../../lib/db/repositories/standup-repository";
import { fetchProjectById } from "../../../../../../lib/db/repositories/projects-repository";
import { type NewProjectStandup } from "../../../../../../lib/db/schema";

function buildUnauthorizedResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

function authorize(request: Request): Response | null {
  const isDevelopment =
    !runtimeConfig.vercelEnv || runtimeConfig.vercelEnv === "development";
  if (isDevelopment) {
    return null;
  }

  const adminToken = runtimeConfig.adminApiToken;
  if (!adminToken) {
    return buildUnauthorizedResponse(
      "Admin API is disabled in production. Set ADMIN_API_TOKEN to enable.",
      403,
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return buildUnauthorizedResponse(
      "Unauthorized. Provide Bearer token in Authorization header.",
      401,
    );
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(
  request: Request,
  { params }: { params: { id: string; standupId: string } },
): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { standupId } = params;

    const standup = await fetchStandupById(standupId);
    if (!standup) {
      return new Response(
        JSON.stringify({
          error: "Standup not found",
          standupId,
        }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    const responses = await fetchStandupResponses(standupId);

    return new Response(
      JSON.stringify({
        standup,
        responses,
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to fetch standup details", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch standup details",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; standupId: string } },
): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id, standupId } = params;
    const url = new URL(request.url);

    // Check if this is a trigger request
    if (!url.pathname.endsWith("/trigger")) {
      return new Response(
        JSON.stringify({
          error: "Invalid action",
          message: "Use POST /trigger to manually trigger standup",
        }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Verify project exists
    const project = await fetchProjectById(id);
    if (!project) {
      return new Response(
        JSON.stringify({
          error: "Project not found",
          id,
        }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Create immediate standup
    const now = new Date();
    const collectUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

    const standupData: NewProjectStandup = {
      projectId: id,
      scheduledFor: now,
      collectUntil,
      channelId: project.channelId || null,
      status: "collecting",
      summary: null,
      triggeredAt: now,
      completedAt: null,
      metadata: {
        manualTrigger: true,
        triggeredFrom: "admin",
      },
    };

    const created = await createStandup(standupData);

    if (!created) {
      return new Response(
        JSON.stringify({
          error: "Failed to trigger standup",
          message: "Database operation failed",
        }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    return new Response(
      JSON.stringify({
        standup: created,
        message: "Standup triggered successfully",
      }),
      {
        status: 201,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to trigger standup", error);
    return new Response(
      JSON.stringify({
        error: "Failed to trigger standup",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}
