import { config as runtimeConfig } from "../../../../../lib/config";
import { fetchProjectById } from "../../../../../lib/db/repositories/projects-repository";
import {
  getStandupCompletionRate,
  getBlockerFrequency,
  fetchRecentStandups,
} from "../../../../../lib/db/repositories/standup-repository";
import {
  getInterviewStats,
  fetchRecentInterviews,
} from "../../../../../lib/db/repositories/interview-repository";

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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

    // Fetch analytics data in parallel
    const [
      standupCompletionRate,
      blockerFrequency,
      recentStandups,
      interviewStats,
      recentInterviews,
    ] = await Promise.all([
      getStandupCompletionRate(id),
      getBlockerFrequency(id),
      fetchRecentStandups(id, 10),
      getInterviewStats(id),
      fetchRecentInterviews(id, 10),
    ]);

    // Calculate task metrics from openTasks
    const openTasks = project.openTasks || [];
    const taskMetrics = {
      totalTasks: openTasks.length,
      openTasks: openTasks.length, // All tasks in this array are open
      completedTasks: 0, // Would need a separate tracking mechanism
      taskVelocity: 0, // Would need historical data
    };

    // Build timeline from recent activity
    const timeline = [
      {
        type: "project_created",
        timestamp: project.createdAt,
        description: `Project "${project.name}" created`,
      },
      ...recentStandups.map((standup) => ({
        type: "standup",
        timestamp: standup.scheduledFor,
        description: `Standup ${standup.status}`,
        status: standup.status,
      })),
      ...recentInterviews.map((interview) => ({
        type: "interview",
        timestamp: interview.completedAt,
        description: `Interview completed (score: ${interview.matchScore})`,
        matchScore: interview.matchScore,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);

    return new Response(
      JSON.stringify({
        projectId: id,
        projectName: project.name,
        standupAnalytics: {
          completionRate: standupCompletionRate,
          blockerFrequency,
          totalStandups: recentStandups.length,
          recentActivity: recentStandups.map((s) => ({
            id: s.id,
            scheduledFor: s.scheduledFor,
            status: s.status,
          })),
        },
        interviewAnalytics: {
          total: interviewStats.total,
          avgMatchScore: interviewStats.avgMatchScore,
          conversionRate: interviewStats.conversionRate,
          topConcerns: interviewStats.topConcerns,
        },
        taskMetrics,
        timeline,
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to fetch analytics", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch analytics",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}
