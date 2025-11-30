import {
  fetchStandupById,
  fetchStandupResponses,
  createStandup,
} from "../../../../../../lib/db/repositories/standup-repository";
import { fetchProjectById } from "../../../../../../lib/db/repositories/projects-repository";
import { type NewProjectStandup } from "../../../../../../lib/db/schema";
import { authorizeAdminRequest, getCorsHeaders } from "../../../../utils";

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(
  request: Request,
  { params }: { params: { id: string; standupId: string } },
): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
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
          headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
      },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; standupId: string } },
): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
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
          headers: getCorsHeaders(request),
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
          headers: getCorsHeaders(request),
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
          headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
      },
    );
  }
}
