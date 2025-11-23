/**
 * Get Project Tool
 *
 * Single-purpose tool for retrieving a ServiceNow SPM Project by its number.
 * Replaces the `servicenow_action` with action="getProject"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getSPMRepository } from "@/infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_project tool
 */
const GetProjectInputSchema = z.object({
  projectNumber: z
    .string()
    .describe(
      "Project number to retrieve (e.g., PRJ0100115). SPM project numbers typically start with PRJ prefix."
    ),
});

export type GetProjectInput = z.infer<typeof GetProjectInputSchema>;

/**
 * Get Project Tool
 *
 * Retrieves a specific ServiceNow SPM (Strategic Portfolio Management) Project by its number.
 */
export function createGetProjectTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "get_project",
    description:
      "Retrieve a specific ServiceNow SPM (Strategic Portfolio Management) project by its number. " +
      "Returns project details including description, state, priority, assignment, dates, and hierarchy.\n\n" +
      "**Use this tool when:**\n" +
      "- User mentions a project number with PRJ prefix (e.g., 'show me PRJ0100115')\n" +
      "- User asks about a specific project's details or status\n" +
      "- You need to check project state, priority, or assignment\n" +
      "- Want to see project timeline (start, due, end dates)\n\n" +
      "**IMPORTANT:**\n" +
      "- projectNumber is REQUIRED (e.g., PRJ0100115)\n" +
      "- For searching multiple projects, use search_projects tool\n" +
      "- To get project epics, use get_project_epics with the project's sys_id\n" +
      "- To get project stories, use get_project_stories with the project's sys_id",

    inputSchema: GetProjectInputSchema,

    execute: async ({ projectNumber }: GetProjectInput) => {
      try {
        console.log(`[get_project] Looking up project: ${projectNumber}`);

        updateStatus?.(`is looking up project ${projectNumber}...`);

        // Fetch project via repository
        const spmRepo = getSPMRepository();
        const project = await spmRepo.findByNumber(projectNumber);

        if (!project) {
          return createErrorResult(
            ServiceNowErrorCodes.NOT_FOUND,
            `Project ${projectNumber} was not found in ServiceNow. ` +
              `This project number may be incorrect or the project may not exist in the system.`,
            { projectNumber }
          );
        }

        console.log(
          `[get_project] Found project ${project.number}: ${project.shortDescription}`
        );

        return createSuccessResult({
          project: {
            sysId: project.sysId,
            number: project.number,
            shortDescription: project.shortDescription,
            description: project.description,
            state: project.state,
            priority: project.priority,
            assignedTo: project.assignedToName,
            assignmentGroup: project.assignmentGroupName,
            projectManager: project.projectManagerName,
            sponsor: project.sponsorName,
            parent: project.parentNumber,
            portfolio: project.portfolioName,
            percentComplete: project.percentComplete,
            lifecycleStage: project.lifecycleStage,
            active: project.active,
            openedAt: project.openedAt?.toISOString(),
            closedAt: project.closedAt?.toISOString(),
            dueDate: project.dueDate?.toISOString(),
            startDate: project.startDate?.toISOString(),
            endDate: project.endDate?.toISOString(),
            url: project.url,
          },
        });
      } catch (error) {
        console.error("[get_project] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve project from ServiceNow",
          { projectNumber }
        );
      }
    },
  });
}
