/**
 * Get Project Epics Tool
 *
 * Single-purpose tool for retrieving epics for a ServiceNow SPM Project.
 * Replaces the `servicenow_action` with action="getProjectEpics"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { createServiceNowContext } from "../../../../infrastructure/servicenow-context";
import { serviceNowClient } from "../../../../tools/servicenow";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_project_epics tool
 */
const GetProjectEpicsInputSchema = z.object({
  projectSysId: z
    .string()
    .describe(
      "Project sys_id (UUID) to retrieve epics for. Use get_project first to get the project's sys_id."
    ),
});

export type GetProjectEpicsInput = z.infer<typeof GetProjectEpicsInputSchema>;

/**
 * Get Project Epics Tool
 *
 * Retrieves all epics for a specific SPM Project.
 */
export function createGetProjectEpicsTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "get_project_epics",
    description:
      "Retrieve all epics for a specific ServiceNow SPM project. " +
      "Returns epic details including description, state, priority, assignment, and completion percentage.\n\n" +
      "**Use this tool when:**\n" +
      "- User asks for epics in a project\n" +
      "- Want to see project breakdown into epics\n" +
      "- Need to understand project scope and work items\n\n" +
      "**IMPORTANT:**\n" +
      "- projectSysId is REQUIRED - use get_project first to obtain the sys_id\n" +
      "- Returns ALL epics for the project (no pagination)\n" +
      "- Epics are high-level work items that contain stories",

    inputSchema: GetProjectEpicsInputSchema,

    execute: async ({ projectSysId }: GetProjectEpicsInput) => {
      try {
        console.log(`[get_project_epics] Fetching epics for project: ${projectSysId}`);

        updateStatus?.(`is fetching epics for project...`);

        // Create ServiceNow context for routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        // Fetch project epics
        const epics = await serviceNowClient.getSPMProjectEpics(
          projectSysId,
          snContext
        );

        console.log(`[get_project_epics] Found ${epics.length} epics for project ${projectSysId}`);

        if (epics.length === 0) {
          return createSuccessResult({
            epics: [],
            totalCount: 0,
            projectSysId,
            message: `No epics found for this project. The project may not have any epics defined yet.`,
          });
        }

        return createSuccessResult({
          epics: epics.map((epic) => ({
            sysId: epic.sysId,
            number: epic.number,
            shortDescription: epic.shortDescription,
            description: epic.description,
            state: epic.state,
            priority: epic.priority,
            assignedTo: epic.assignedToName,
            percentComplete: epic.percentComplete,
            dueDate: epic.dueDate?.toISOString(),
            parent: epic.parentNumber,
            url: epic.url,
          })),
          totalCount: epics.length,
          projectSysId,
          message: `Found ${epics.length} epic(s) for this project`,
        });
      } catch (error) {
        console.error("[get_project_epics] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve project epics from ServiceNow",
          { projectSysId }
        );
      }
    },
  });
}
