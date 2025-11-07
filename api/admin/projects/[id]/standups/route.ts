import { config as runtimeConfig } from "../../../../../lib/config";
import { fetchProjectById, updateProject } from "../../../../../lib/db/repositories/projects-repository";
import {
  fetchStandupsByProject,
  createStandup,
} from "../../../../../lib/db/repositories/standup-repository";
import { type NewProjectStandup } from "../../../../../lib/db/schema";

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
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = params;

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

    const standups = await fetchStandupsByProject(id);

    return new Response(
      JSON.stringify({
        standups,
        config: project.standupConfig,
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to fetch standups", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch standups",
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
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = params;
    const body = await request.json();

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

    // Validate required fields
    if (!body.scheduledFor || !body.collectUntil) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["scheduledFor", "collectUntil"],
        }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Create standup
    const standupData: NewProjectStandup = {
      projectId: id,
      scheduledFor: new Date(body.scheduledFor),
      collectUntil: new Date(body.collectUntil),
      channelId: body.channelId || project.channelId || null,
      status: body.status || "collecting",
      summary: body.summary || null,
      triggeredAt: body.triggeredAt ? new Date(body.triggeredAt) : new Date(),
      completedAt: body.completedAt ? new Date(body.completedAt) : null,
      metadata: body.metadata || {},
    };

    const created = await createStandup(standupData);

    if (!created) {
      return new Response(
        JSON.stringify({
          error: "Failed to create standup",
          message: "Database operation failed",
        }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    return new Response(JSON.stringify({ standup: created }), {
      status: 201,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("[AdminAPI] Failed to create standup", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create standup",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = params;
    const body = await request.json();

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

    // Update standup config
    const updated = await updateProject(id, {
      standupConfig: body.config,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          error: "Failed to update standup config",
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
        project: updated,
        config: updated.standupConfig,
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to update standup config", error);
    return new Response(
      JSON.stringify({
        error: "Failed to update standup config",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}
