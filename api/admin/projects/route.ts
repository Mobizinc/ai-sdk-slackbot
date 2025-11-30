import {
  fetchAllProjects,
  getProjectStats,
  countProjects,
  createProject,
  updateProject,
  type ProjectFilters,
} from "../../../lib/db/repositories/projects-repository";
import { type NewProjectRecord } from "../../../lib/db/schema";
import { getSPMRepository } from "../../../lib/infrastructure/servicenow/repositories/factory";
import type { SPMProject } from "../../../lib/infrastructure/servicenow/types/domain-models";
import { authorizeAdminRequest, getCorsHeaders } from "../utils";

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
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

    const typeParam = url.searchParams.get("type");
    if (typeParam) {
      filters.type = typeParam.includes(",") ? typeParam.split(",") : typeParam;
    }

    const sourceParam = url.searchParams.get("source");
    if (sourceParam) {
      filters.source = sourceParam.includes(",") ? sourceParam.split(",") : sourceParam;
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
  const unauthorized = authorizeAdminRequest(request);
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
      type: body.type || "internal",
      source: body.source || "local",
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
      // SPM fields if provided
      spmSysId: body.spmSysId || null,
      spmNumber: body.spmNumber || null,
      spmState: body.spmState || null,
      spmPriority: body.spmPriority || null,
      spmPercentComplete: body.spmPercentComplete ?? null,
      spmLifecycleStage: body.spmLifecycleStage || null,
      spmProjectManagerSysId: body.spmProjectManagerSysId || null,
      spmProjectManagerName: body.spmProjectManagerName || null,
      spmAssignmentGroupSysId: body.spmAssignmentGroupSysId || null,
      spmAssignmentGroupName: body.spmAssignmentGroupName || null,
      spmParentSysId: body.spmParentSysId || null,
      spmParentNumber: body.spmParentNumber || null,
      spmPortfolioName: body.spmPortfolioName || null,
      spmUrl: body.spmUrl || null,
      spmOpenedAt: body.spmOpenedAt ? new Date(body.spmOpenedAt) : null,
      spmClosedAt: body.spmClosedAt ? new Date(body.spmClosedAt) : null,
      spmDueDate: body.spmDueDate ? new Date(body.spmDueDate) : null,
      spmSyncEnabled: body.spmSyncEnabled ?? false,
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

    // Optionally create SPM project in ServiceNow
    let spmProject: SPMProject | null = null;
    let spmError: { message: string } | null = null;

    if (body.createSPMProject) {
      try {
        const spmRepo = getSPMRepository();
        spmProject = await spmRepo.create({
          shortDescription: body.name,
          description: body.summary,
          projectManager: body.spmProjectManager,
          assignmentGroup: body.spmAssignmentGroup,
          priority: body.spmPriority,
          dueDate: body.spmDueDate,
          lifecycleStage: body.spmLifecycleStage,
        });

        // Link the SPM project to local project
        await updateProject(created.id, {
          spmSysId: spmProject.sysId,
          spmNumber: spmProject.number,
          spmState: spmProject.state,
          spmUrl: spmProject.url,
          spmOpenedAt: spmProject.openedAt || null,
          spmProjectManagerName: spmProject.projectManagerName || null,
          spmProjectManagerSysId: spmProject.projectManagerSysId || null,
          spmAssignmentGroupName: spmProject.assignmentGroupName || null,
          spmAssignmentGroupSysId: spmProject.assignmentGroupSysId || null,
          spmSyncEnabled: true,
          spmLastSyncedAt: new Date(),
        });

      } catch (error) {
        console.error("[AdminAPI] Failed to create SPM project", error);
        spmError = {
          message: error instanceof Error ? error.message : "Unknown SPM creation error",
        };
      }
    }

    return new Response(
      JSON.stringify({
        project: created,
        spmProject,
        spmError,
      }),
      {
        status: 201,
        headers: getCorsHeaders(request),
      },
    );
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
