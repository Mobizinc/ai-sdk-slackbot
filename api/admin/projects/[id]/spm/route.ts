/**
 * SPM Integration API Routes
 *
 * POST /api/admin/projects/[id]/spm/link - Link to existing SPM project
 * POST /api/admin/projects/[id]/spm/create - Create new SPM project and link
 * POST /api/admin/projects/[id]/spm/sync - Manual sync from ServiceNow
 * DELETE /api/admin/projects/[id]/spm - Unlink SPM project
 */

import { config as runtimeConfig } from "../../../../../lib/config";
import {
  fetchProjectById,
  updateProject,
} from "../../../../../lib/db/repositories/projects-repository";
import { getSPMRepository } from "../../../../../lib/infrastructure/servicenow/repositories/factory";
import type { SPMProject } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

function buildUnauthorizedResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain" },
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
  return ALLOWED_ORIGINS[0];
}

function getCorsHeaders(request: Request): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Access-Control-Allow-Origin": getAllowedOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * POST /api/admin/projects/[id]/spm
 *
 * Actions:
 * - action: "link" - Link to existing SPM project (requires spmSysId or spmNumber)
 * - action: "create" - Create new SPM project and link
 * - action: "sync" - Manual sync from ServiceNow
 */
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
    const action = body.action as "link" | "create" | "sync";

    // Validate action
    if (!["link", "create", "sync"].includes(action)) {
      return new Response(
        JSON.stringify({
          error: "Invalid action",
          message: 'Action must be one of: "link", "create", "sync"',
        }),
        { status: 400, headers: getCorsHeaders(request) },
      );
    }

    // Check if project exists
    const project = await fetchProjectById(id);
    if (!project) {
      return new Response(
        JSON.stringify({ error: "Project not found", id }),
        { status: 404, headers: getCorsHeaders(request) },
      );
    }

    const spmRepo = getSPMRepository();

    // Handle different actions
    switch (action) {
      case "link": {
        // Link to existing SPM project
        const { spmSysId, spmNumber } = body;

        if (!spmSysId && !spmNumber) {
          return new Response(
            JSON.stringify({
              error: "Missing identifier",
              message: "Provide either spmSysId or spmNumber to link",
            }),
            { status: 400, headers: getCorsHeaders(request) },
          );
        }

        let spmProject: SPMProject | null = null;

        if (spmSysId) {
          spmProject = await spmRepo.findBySysId(spmSysId);
        } else if (spmNumber) {
          spmProject = await spmRepo.findByNumber(spmNumber);
        }

        if (!spmProject) {
          return new Response(
            JSON.stringify({
              error: "SPM project not found",
              message: `No SPM project found with ${spmSysId ? "sys_id: " + spmSysId : "number: " + spmNumber}`,
            }),
            { status: 404, headers: getCorsHeaders(request) },
          );
        }

        // Update local project with SPM linkage
        const updated = await updateProject(id, {
          spmSysId: spmProject.sysId,
          spmNumber: spmProject.number,
          spmState: spmProject.state,
          spmPriority: spmProject.priority || null,
          spmPercentComplete: spmProject.percentComplete ?? null,
          spmLifecycleStage: spmProject.lifecycleStage || null,
          spmProjectManagerSysId: spmProject.projectManagerSysId || null,
          spmProjectManagerName: spmProject.projectManagerName || null,
          spmAssignmentGroupSysId: spmProject.assignmentGroupSysId || null,
          spmAssignmentGroupName: spmProject.assignmentGroupName || null,
          spmParentSysId: spmProject.parent || null,
          spmParentNumber: spmProject.parentNumber || null,
          spmPortfolioName: spmProject.portfolioName || null,
          spmUrl: spmProject.url,
          spmOpenedAt: spmProject.openedAt || null,
          spmClosedAt: spmProject.closedAt || null,
          spmDueDate: spmProject.dueDate || null,
          spmSyncEnabled: true,
          spmLastSyncedAt: new Date(),
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `Linked to SPM project ${spmProject.number}`,
            project: updated,
            spmProject,
          }),
          { status: 200, headers: getCorsHeaders(request) },
        );
      }

      case "create": {
        // Create new SPM project and link
        const {
          shortDescription,
          description,
          projectManager,
          assignmentGroup,
          priority,
          dueDate,
          lifecycleStage,
        } = body;

        const spmProject = await spmRepo.create({
          shortDescription: shortDescription || project.name,
          description: description || project.summary,
          projectManager,
          assignmentGroup,
          priority,
          dueDate,
          lifecycleStage,
        });

        // Update local project with SPM linkage
        const updated = await updateProject(id, {
          spmSysId: spmProject.sysId,
          spmNumber: spmProject.number,
          spmState: spmProject.state,
          spmPriority: spmProject.priority || null,
          spmPercentComplete: spmProject.percentComplete ?? null,
          spmLifecycleStage: spmProject.lifecycleStage || null,
          spmProjectManagerSysId: spmProject.projectManagerSysId || null,
          spmProjectManagerName: spmProject.projectManagerName || null,
          spmAssignmentGroupSysId: spmProject.assignmentGroupSysId || null,
          spmAssignmentGroupName: spmProject.assignmentGroupName || null,
          spmUrl: spmProject.url,
          spmOpenedAt: spmProject.openedAt || null,
          spmSyncEnabled: true,
          spmLastSyncedAt: new Date(),
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `Created and linked SPM project ${spmProject.number}`,
            project: updated,
            spmProject,
          }),
          { status: 201, headers: getCorsHeaders(request) },
        );
      }

      case "sync": {
        // Manual sync from ServiceNow
        if (!project.spmSysId) {
          return new Response(
            JSON.stringify({
              error: "Not linked",
              message: "Project is not linked to an SPM project",
            }),
            { status: 400, headers: getCorsHeaders(request) },
          );
        }

        const spmProject = await spmRepo.findBySysId(project.spmSysId);

        if (!spmProject) {
          return new Response(
            JSON.stringify({
              error: "SPM project not found",
              message: `Linked SPM project ${project.spmNumber} no longer exists`,
              spmSysId: project.spmSysId,
            }),
            { status: 404, headers: getCorsHeaders(request) },
          );
        }

        // Fetch epics and stories
        const [epics, stories] = await Promise.all([
          spmRepo.findRelatedEpics(project.spmSysId),
          spmRepo.findRelatedStories(project.spmSysId),
        ]);

        // Update local project with fresh SPM data
        const updated = await updateProject(id, {
          spmState: spmProject.state,
          spmPriority: spmProject.priority || null,
          spmPercentComplete: spmProject.percentComplete ?? null,
          spmLifecycleStage: spmProject.lifecycleStage || null,
          spmProjectManagerSysId: spmProject.projectManagerSysId || null,
          spmProjectManagerName: spmProject.projectManagerName || null,
          spmAssignmentGroupSysId: spmProject.assignmentGroupSysId || null,
          spmAssignmentGroupName: spmProject.assignmentGroupName || null,
          spmParentSysId: spmProject.parent || null,
          spmParentNumber: spmProject.parentNumber || null,
          spmPortfolioName: spmProject.portfolioName || null,
          spmOpenedAt: spmProject.openedAt || null,
          spmClosedAt: spmProject.closedAt || null,
          spmDueDate: spmProject.dueDate || null,
          spmLastSyncedAt: new Date(),
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `Synced from SPM project ${spmProject.number}`,
            project: updated,
            spmProject,
            spmEpics: epics,
            spmStories: stories,
          }),
          { status: 200, headers: getCorsHeaders(request) },
        );
      }
    }
  } catch (error) {
    console.error("[AdminAPI] SPM operation failed", error);
    return new Response(
      JSON.stringify({
        error: "SPM operation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: getCorsHeaders(request) },
    );
  }
}

/**
 * DELETE /api/admin/projects/[id]/spm
 *
 * Unlink SPM project (keeps local project, clears SPM fields)
 */
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
    const project = await fetchProjectById(id);
    if (!project) {
      return new Response(
        JSON.stringify({ error: "Project not found", id }),
        { status: 404, headers: getCorsHeaders(request) },
      );
    }

    if (!project.spmSysId) {
      return new Response(
        JSON.stringify({
          error: "Not linked",
          message: "Project is not linked to an SPM project",
        }),
        { status: 400, headers: getCorsHeaders(request) },
      );
    }

    const previousSpmNumber = project.spmNumber;
    const previousSpmSysId = project.spmSysId;

    // Clear SPM fields but retain spmSysId in history (as null fields indicate unlinked)
    const updated = await updateProject(id, {
      spmSysId: null,
      spmNumber: null,
      spmState: null,
      spmPriority: null,
      spmPercentComplete: null,
      spmLifecycleStage: null,
      spmProjectManagerSysId: null,
      spmProjectManagerName: null,
      spmAssignmentGroupSysId: null,
      spmAssignmentGroupName: null,
      spmParentSysId: null,
      spmParentNumber: null,
      spmPortfolioName: null,
      spmUrl: null,
      spmOpenedAt: null,
      spmClosedAt: null,
      spmDueDate: null,
      spmSyncEnabled: false,
      spmLastSyncedAt: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Unlinked from SPM project ${previousSpmNumber}`,
        project: updated,
        unlinked: {
          spmSysId: previousSpmSysId,
          spmNumber: previousSpmNumber,
        },
      }),
      { status: 200, headers: getCorsHeaders(request) },
    );
  } catch (error) {
    console.error("[AdminAPI] SPM unlink failed", error);
    return new Response(
      JSON.stringify({
        error: "SPM unlink failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: getCorsHeaders(request) },
    );
  }
}

/**
 * GET /api/admin/projects/[id]/spm
 *
 * Get SPM project details with epics and stories
 */
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

    // Check if project exists
    const project = await fetchProjectById(id);
    if (!project) {
      return new Response(
        JSON.stringify({ error: "Project not found", id }),
        { status: 404, headers: getCorsHeaders(request) },
      );
    }

    if (!project.spmSysId) {
      return new Response(
        JSON.stringify({
          linked: false,
          message: "Project is not linked to an SPM project",
        }),
        { status: 200, headers: getCorsHeaders(request) },
      );
    }

    const spmRepo = getSPMRepository();
    const spmProject = await spmRepo.findBySysId(project.spmSysId);

    if (!spmProject) {
      return new Response(
        JSON.stringify({
          linked: true,
          orphaned: true,
          message: `Linked SPM project ${project.spmNumber} no longer exists`,
          cachedData: {
            spmSysId: project.spmSysId,
            spmNumber: project.spmNumber,
            spmState: project.spmState,
            spmLastSyncedAt: project.spmLastSyncedAt,
          },
        }),
        { status: 200, headers: getCorsHeaders(request) },
      );
    }

    // Fetch epics and stories
    const [epics, stories] = await Promise.all([
      spmRepo.findRelatedEpics(project.spmSysId),
      spmRepo.findRelatedStories(project.spmSysId),
    ]);

    return new Response(
      JSON.stringify({
        linked: true,
        spmProject,
        spmEpics: epics,
        spmStories: stories,
        lastSyncedAt: project.spmLastSyncedAt,
        syncEnabled: project.spmSyncEnabled,
      }),
      { status: 200, headers: getCorsHeaders(request) },
    );
  } catch (error) {
    console.error("[AdminAPI] SPM fetch failed", error);
    return new Response(
      JSON.stringify({
        error: "SPM fetch failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: getCorsHeaders(request) },
    );
  }
}
