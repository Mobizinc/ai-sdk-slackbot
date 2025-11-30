import { fetchProjectById, updateProject } from "../../../../../lib/db/repositories/projects-repository";
import {
  fetchStandupsByProject,
  createStandup,
} from "../../../../../lib/db/repositories/standup-repository";
import { type NewProjectStandup } from "../../../../../lib/db/schema";
import { authorizeAdminRequest, getCorsHeaders } from "../../../utils";

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
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
          headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
      },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
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
          headers: getCorsHeaders(request),
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
          headers: getCorsHeaders(request),
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
          headers: getCorsHeaders(request),
        },
      );
    }

    return new Response(JSON.stringify({ standup: created }), {
      status: 201,
      headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
      },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
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
          headers: getCorsHeaders(request),
        },
      );
    }

    // Update standup config
    // Basic validation defaults
    const config = body.config ?? {};
    const frequency = config.schedule?.frequency || config.cadence || "daily";
    const timeUtc = config.schedule?.timeUtc || config.timeUtc || config.time || "13:00";
    const dayOfWeek = config.schedule?.dayOfWeek;

    const normalizedConfig = {
      enabled: Boolean(config.enabled),
      channelId: config.channelId || project.channelId || null,
      cadence: frequency,
      timeUtc,
      schedule: {
        frequency,
        timeUtc,
        dayOfWeek,
      },
      participants: Array.isArray(config.participants) ? config.participants : [],
      dataSources: {
        useSpmTasks: Boolean(config.dataSources?.useSpmTasks),
        useGithubIssues: Boolean(config.dataSources?.useGithubIssues),
        useLocalOpenTasks: config.dataSources?.useLocalOpenTasks !== false, // default true
      },
    };

    const updated = await updateProject(id, {
      standupConfig: normalizedConfig,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          error: "Failed to update standup config",
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
        project: updated,
        config: updated.standupConfig,
      }),
      {
        status: 200,
        headers: getCorsHeaders(request),
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
        headers: getCorsHeaders(request),
      },
    );
  }
}
