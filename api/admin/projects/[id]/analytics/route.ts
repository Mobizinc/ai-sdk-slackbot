import { config as runtimeConfig } from "../../../../../lib/config";
import { fetchProjectById } from "../../../../../lib/db/repositories/projects-repository";
import { getSPMRepository } from "../../../../../lib/infrastructure/servicenow/repositories";
import { getGitHubClient } from "../../../../../lib/integrations/github/client";
import { cacheGet, cacheSet } from "../../../../../lib/cache/redis";
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
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";

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
      spmSummary,
      githubSummary,
    ] = await Promise.all([
      getStandupCompletionRate(id),
      getBlockerFrequency(id),
      fetchRecentStandups(id, 10),
      getInterviewStats(id),
      fetchRecentInterviews(id, 10),
      (async () => {
        const spmSysId = (project as any).spmSysId;
        if (!spmSysId) return null;
        const cacheKey = `analytics:spm:${id}`;
        if (!refresh) {
          const cached = await cacheGet<any>(cacheKey);
          if (cached) return cached;
        }
        try {
          const repo = getSPMRepository();
          const spmProject = await repo.findBySysId(spmSysId);
          if (!spmProject) return null;
          const [epics, stories] = await Promise.all([
            repo.findRelatedEpics(spmSysId).catch(() => []),
            repo.findRelatedStories(spmSysId).catch(() => []),
          ]);
          const summary = {
            number: spmProject.number,
            state: spmProject.state,
            percentComplete: spmProject.percentComplete,
            priority: spmProject.priority,
            lifecycleStage: spmProject.lifecycleStage,
            dueDate: spmProject.dueDate,
            epics: epics.slice(0, 5).map((e) => ({ number: e.number, shortDescription: e.shortDescription })),
            stories: stories.slice(0, 10).map((s) => ({ number: s.number, shortDescription: s.shortDescription, state: s.state })),
          };
          await cacheSet(cacheKey, summary, 600); // 10 minutes
          return summary;
        } catch (error) {
          console.warn("[Analytics] Failed to fetch SPM summary", error);
          return null;
        }
      })(),
      (async () => {
        const githubRepo = (project as any).githubRepo;
        if (!githubRepo) return null;
        const parts = githubRepo.split("/");
        if (parts.length !== 2) return null;
        const cacheKey = `analytics:gh:${id}`;
        if (!refresh) {
          const cached = await cacheGet<any>(cacheKey);
          if (cached) return cached;
        }
        try {
          const client = await getGitHubClient();
          const [repoResp, issuesResp, prsResp] = await Promise.all([
            client.repos.get({ owner: parts[0], repo: parts[1] }),
            client.issues.listForRepo({ owner: parts[0], repo: parts[1], state: "open", per_page: 1 }),
            client.pulls.list({ owner: parts[0], repo: parts[1], state: "open", per_page: 1 }),
          ]);
          const summary = {
            fullName: repoResp.data.full_name,
            defaultBranch: repoResp.data.default_branch,
            openIssuesCount: repoResp.data.open_issues_count,
            openPrCount: (prsResp.data ?? []).length,
            repoUrl: repoResp.data.html_url,
          };
          await cacheSet(cacheKey, summary, 600); // 10 minutes
          return summary;
        } catch (error) {
          console.warn("[Analytics] Failed to fetch GitHub summary", error);
          return null;
        }
      })(),
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
        spmSummary,
        githubSummary,
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
