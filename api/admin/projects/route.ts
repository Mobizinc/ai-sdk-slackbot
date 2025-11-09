import { config as runtimeConfig } from "../../../lib/config";
import {
  fetchAllProjects,
  getProjectStats,
  countProjects,
  createProject,
  type ProjectFilters,
} from "../../../lib/db/repositories/projects-repository";
import { type NewProjectRecord } from "../../../lib/db/schema";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const url = new URL(request.url);
    const filters: ProjectFilters = {};

    // Parse query parameters
    const statusParam = url.searchParams.get("status");
    if (statusParam) {
      filters.status = statusParam.includes(",") ? statusParam.split(",") : statusParam;
    }

    const mentorParam = url.searchParams.get("mentor");
    if (mentorParam) {
      filters.mentorSlackUserId = mentorParam;
    }

    const searchParam = url.searchParams.get("search");
    if (searchParam) {
      filters.search = searchParam;
    }

    const limitParam = url.searchParams.get("limit");
    if (limitParam) {
      filters.limit = parseInt(limitParam, 10);
    }

    const offsetParam = url.searchParams.get("offset");
    if (offsetParam) {
      filters.offset = parseInt(offsetParam, 10);
    }

    // Fetch data
    const [projects, stats, total] = await Promise.all([
      fetchAllProjects(filters),
      getProjectStats(),
      countProjects(filters),
    ]);

    return new Response(
      JSON.stringify({
        projects,
        stats,
        total,
        filters,
      }),
      {
        status: 200,
        headers: getCorsHeaders(request),
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to fetch projects", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch projects",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: getCorsHeaders(request),
      },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.id || !body.name || !body.summary) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["id", "name", "summary"],
        }),
        {
          status: 400,
          headers: getCorsHeaders(request),
        },
      );
    }

    // Create project data
    const projectData: NewProjectRecord = {
      id: body.id,
      name: body.name,
      status: body.status || "draft",
      githubUrl: body.githubUrl || null,
      summary: body.summary,
      background: body.background || null,
      techStack: body.techStack || [],
      skillsRequired: body.skillsRequired || [],
      skillsNiceToHave: body.skillsNiceToHave || [],
      difficultyLevel: body.difficultyLevel || null,
      estimatedHours: body.estimatedHours || null,
      learningOpportunities: body.learningOpportunities || [],
      openTasks: body.openTasks || [],
      mentorSlackUserId: body.mentorSlackUserId || null,
      mentorName: body.mentorName || null,
      interviewConfig: body.interviewConfig || null,
      standupConfig: body.standupConfig || null,
      maxCandidates: body.maxCandidates || null,
      postedDate: body.postedDate ? new Date(body.postedDate) : null,
      expiresDate: body.expiresDate ? new Date(body.expiresDate) : null,
      channelId: body.channelId || null,
      githubRepo: body.githubRepo || null,
      githubDefaultBranch: body.githubDefaultBranch || null,
    };

    const created = await createProject(projectData);

    if (!created) {
      return new Response(
        JSON.stringify({
          error: "Failed to create project",
          message: "Database operation failed",
        }),
        {
          status: 500,
          headers: getCorsHeaders(request),
        },
      );
    }

    return new Response(JSON.stringify({ project: created }), {
      status: 201,
      headers: getCorsHeaders(request),
    });
  } catch (error) {
    console.error("[AdminAPI] Failed to create project", error);
    return new Response(
      JSON.stringify({
        error: "Failed to create project",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: getCorsHeaders(request),
      },
    );
  }
}
