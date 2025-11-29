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
import { getSPMRepository } from "../../../../lib/infrastructure/servicenow/repositories/factory";
import type { SPMProject, SPMEpic, SPMStory } from "../../../../lib/infrastructure/servicenow/types/domain-models";
import { authorizeAdminRequest, getCorsHeaders } from "../../utils";

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

    // Fetch live SPM data if linked
    let spmProject: SPMProject | null = null;
    let spmEpics: SPMEpic[] = [];
    let spmStories: SPMStory[] = [];
    let spmError: { message: string; timestamp: Date } | null = null;

    if (project.spmSysId && project.spmSyncEnabled) {
      try {
        const spmRepo = getSPMRepository();
        spmProject = await spmRepo.findBySysId(project.spmSysId);

        // Fetch related epics and stories
        if (spmProject) {
          const [epics, stories] = await Promise.all([
            spmRepo.findRelatedEpics(project.spmSysId),
            spmRepo.findRelatedStories(project.spmSysId),
          ]);
          spmEpics = epics;
          spmStories = stories;

          // Update cached SPM fields (background update - don't await)
          updateProject(id, {
            spmState: spmProject.state,
            spmPriority: spmProject.priority || null,
            spmPercentComplete: spmProject.percentComplete ?? null,
            spmLifecycleStage: spmProject.lifecycleStage || null,
            spmProjectManagerName: spmProject.projectManagerName || null,
            spmProjectManagerSysId: spmProject.projectManagerSysId || null,
            spmAssignmentGroupName: spmProject.assignmentGroupName || null,
            spmAssignmentGroupSysId: spmProject.assignmentGroupSysId || null,
            spmParentSysId: spmProject.parent || null,
            spmParentNumber: spmProject.parentNumber || null,
            spmPortfolioName: spmProject.portfolioName || null,
            spmOpenedAt: spmProject.openedAt || null,
            spmClosedAt: spmProject.closedAt || null,
            spmDueDate: spmProject.dueDate || null,
            spmLastSyncedAt: new Date(),
          }).catch((err) =>
            console.error("[AdminAPI] SPM cache update failed", {
              projectId: id,
              error: err,
            }),
          );
        }
      } catch (error) {
        spmError = {
          message: error instanceof Error ? error.message : "Unknown SPM error",
          timestamp: new Date(),
        };
        console.error("[AdminAPI] SPM fetch failed", { projectId: id, error });
      }
    }

    return new Response(
      JSON.stringify({
        project,
        standups,
        interviews,
        initiations,
        evaluations,
        // SPM integration data
        spmProject,
        spmEpics,
        spmStories,
        spmError,
        usingSPMCache: !!spmError && !!project.spmState,
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
  const unauthorized = authorizeAdminRequest(request);
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
    if (body.type !== undefined) updateData.type = body.type;
    if (body.source !== undefined) updateData.source = body.source;
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

    // Handle SPM field updates
    if (body.spmSysId !== undefined) updateData.spmSysId = body.spmSysId;
    if (body.spmNumber !== undefined) updateData.spmNumber = body.spmNumber;
    if (body.spmState !== undefined) updateData.spmState = body.spmState;
    if (body.spmPriority !== undefined) updateData.spmPriority = body.spmPriority;
    if (body.spmPercentComplete !== undefined) updateData.spmPercentComplete = body.spmPercentComplete;
    if (body.spmLifecycleStage !== undefined) updateData.spmLifecycleStage = body.spmLifecycleStage;
    if (body.spmProjectManagerSysId !== undefined) updateData.spmProjectManagerSysId = body.spmProjectManagerSysId;
    if (body.spmProjectManagerName !== undefined) updateData.spmProjectManagerName = body.spmProjectManagerName;
    if (body.spmAssignmentGroupSysId !== undefined) updateData.spmAssignmentGroupSysId = body.spmAssignmentGroupSysId;
    if (body.spmAssignmentGroupName !== undefined) updateData.spmAssignmentGroupName = body.spmAssignmentGroupName;
    if (body.spmParentSysId !== undefined) updateData.spmParentSysId = body.spmParentSysId;
    if (body.spmParentNumber !== undefined) updateData.spmParentNumber = body.spmParentNumber;
    if (body.spmPortfolioName !== undefined) updateData.spmPortfolioName = body.spmPortfolioName;
    if (body.spmUrl !== undefined) updateData.spmUrl = body.spmUrl;
    if (body.spmOpenedAt !== undefined)
      updateData.spmOpenedAt = body.spmOpenedAt ? new Date(body.spmOpenedAt) : null;
    if (body.spmClosedAt !== undefined)
      updateData.spmClosedAt = body.spmClosedAt ? new Date(body.spmClosedAt) : null;
    if (body.spmDueDate !== undefined)
      updateData.spmDueDate = body.spmDueDate ? new Date(body.spmDueDate) : null;
    if (body.spmSyncEnabled !== undefined) updateData.spmSyncEnabled = body.spmSyncEnabled;

    // Bidirectional sync: Push changes to ServiceNow if requested
    let spmSyncResult: { success: boolean; error?: string } | null = null;
    if (body.syncToSPM && existing.spmSysId && existing.spmSyncEnabled) {
      try {
        const spmRepo = getSPMRepository();
        const spmUpdates: Record<string, string | number | undefined> = {};

        // Map local fields to SPM fields for sync
        if (body.name !== undefined) spmUpdates.shortDescription = body.name;
        if (body.summary !== undefined) spmUpdates.description = body.summary;
        if (body.spmState !== undefined) spmUpdates.state = body.spmState;
        if (body.spmPercentComplete !== undefined) spmUpdates.percentComplete = body.spmPercentComplete;
        if (body.spmPriority !== undefined) spmUpdates.priority = body.spmPriority;
        if (body.spmLifecycleStage !== undefined) spmUpdates.lifecycleStage = body.spmLifecycleStage;

        if (Object.keys(spmUpdates).length > 0) {
          await spmRepo.update(existing.spmSysId, spmUpdates);
          updateData.spmLastSyncedAt = new Date();
          spmSyncResult = { success: true };
        }
      } catch (error) {
        console.error("[AdminAPI] Failed to sync to SPM", { projectId: id, error });
        spmSyncResult = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown SPM sync error",
        };
      }
    }

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

    return new Response(
      JSON.stringify({
        project: updated,
        spmSyncResult,
      }),
      {
        status: 200,
        headers: getCorsHeaders(request),
      },
    );
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
  const unauthorized = authorizeAdminRequest(request);
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
