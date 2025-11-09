import { config as runtimeConfig } from "../../../../lib/config";
import {
  fetchProjectById,
  updateProject,
  deleteProject,
} from "../../../../lib/db/repositories/projects-repository";
import { fetchStandupsByProject } from "../../../../lib/db/repositories/standup-repository";
import { fetchInterviewsByProject } from "../../../../lib/db/repositories/interview-repository";
import {
  fetchInitiationsByProject,
  fetchEvaluationsByProject,
} from "../../../../lib/db/repositories/initiation-repository";
import { type NewProjectRecord } from "../../../../lib/db/schema";

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

const ALLOWED_ORIGINS = [
  "https://admin.mobiz.solutions",
  "https://dev.admin.mobiz.solutions",
];

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0]; // Default to production
}

function getCorsHeaders(request: Request): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Access-Control-Allow-Origin": getAllowedOrigin(request),
    "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

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
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = params;
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

    // Fetch related data
    const [standups, interviews, initiations, evaluations] = await Promise.all([
      fetchStandupsByProject(id),
      fetchInterviewsByProject(id),
      fetchInitiationsByProject(id),
      fetchEvaluationsByProject(project.name),
    ]);

    return new Response(
      JSON.stringify({
        project,
        standups,
        interviews,
        initiations,
        evaluations,
      }),
      {
        status: 200,
        headers: getCorsHeaders(request),
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to fetch project", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch project",
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
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = params;
    const body = await request.json();

    // Check if project exists
    const existing = await fetchProjectById(id);
    if (!existing) {
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

    // Build update data (only include provided fields)
    const updateData: Partial<Omit<NewProjectRecord, "id">> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.githubUrl !== undefined) updateData.githubUrl = body.githubUrl;
    if (body.summary !== undefined) updateData.summary = body.summary;
    if (body.background !== undefined) updateData.background = body.background;
    if (body.techStack !== undefined) updateData.techStack = body.techStack;
    if (body.skillsRequired !== undefined) updateData.skillsRequired = body.skillsRequired;
    if (body.skillsNiceToHave !== undefined)
      updateData.skillsNiceToHave = body.skillsNiceToHave;
    if (body.difficultyLevel !== undefined) updateData.difficultyLevel = body.difficultyLevel;
    if (body.estimatedHours !== undefined) updateData.estimatedHours = body.estimatedHours;
    if (body.learningOpportunities !== undefined)
      updateData.learningOpportunities = body.learningOpportunities;
    if (body.openTasks !== undefined) updateData.openTasks = body.openTasks;
    if (body.mentorSlackUserId !== undefined)
      updateData.mentorSlackUserId = body.mentorSlackUserId;
    if (body.mentorName !== undefined) updateData.mentorName = body.mentorName;
    if (body.interviewConfig !== undefined) updateData.interviewConfig = body.interviewConfig;
    if (body.standupConfig !== undefined) updateData.standupConfig = body.standupConfig;
    if (body.maxCandidates !== undefined) updateData.maxCandidates = body.maxCandidates;
    if (body.postedDate !== undefined)
      updateData.postedDate = body.postedDate ? new Date(body.postedDate) : null;
    if (body.expiresDate !== undefined)
      updateData.expiresDate = body.expiresDate ? new Date(body.expiresDate) : null;
    if (body.channelId !== undefined) updateData.channelId = body.channelId;
    if (body.githubRepo !== undefined) updateData.githubRepo = body.githubRepo;
    if (body.githubDefaultBranch !== undefined)
      updateData.githubDefaultBranch = body.githubDefaultBranch;

    const updated = await updateProject(id, updateData);

    if (!updated) {
      return new Response(
        JSON.stringify({
          error: "Failed to update project",
          message: "Database operation failed",
        }),
        {
          status: 500,
          headers: getCorsHeaders(request),
        },
      );
    }

    return new Response(JSON.stringify({ project: updated }), {
      status: 200,
      headers: getCorsHeaders(request),
    });
  } catch (error) {
    console.error("[AdminAPI] Failed to update project", error);
    return new Response(
      JSON.stringify({
        error: "Failed to update project",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: getCorsHeaders(request),
      },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = params;

    // Check if project exists
    const existing = await fetchProjectById(id);
    if (!existing) {
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

    const success = await deleteProject(id);

    if (!success) {
      return new Response(
        JSON.stringify({
          error: "Failed to delete project",
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
        success: true,
        message: "Project archived successfully",
        id,
      }),
      {
        status: 200,
        headers: getCorsHeaders(request),
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to delete project", error);
    return new Response(
      JSON.stringify({
        error: "Failed to delete project",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: getCorsHeaders(request),
      },
    );
  }
}
