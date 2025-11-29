/**
 * Get Change Tasks Tool
 *
 * Single-purpose tool for retrieving change tasks (state transitions) for a Change Request.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getChangeRepository } from "../../../../infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_change_tasks tool
 */
const GetChangeTasksInputSchema = z.object({
  changeSysId: z
    .string()
    .describe(
      "Change Request sys_id (UUID) to retrieve tasks for. Use get_change first to get the change's sys_id."
    ),
});

export type GetChangeTasksInput = z.infer<typeof GetChangeTasksInputSchema>;

/**
 * Get Change Tasks Tool
 *
 * Retrieves change tasks (state transitions) for a specific Change Request.
 */
export function createGetChangeTasksTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "get_change_tasks",
    description:
      "Retrieve change tasks (state transitions) for a specific ServiceNow Change Request. " +
      "Returns task details including state, from/to states, and creation information.\n\n" +
      "**Use this tool when:**\n" +
      "- You need to see the workflow tasks for a change\n" +
      "- Want to understand change state progression\n" +
      "- Need to review change approval or implementation tasks\n\n" +
      "**IMPORTANT:**\n" +
      "- changeSysId is REQUIRED - use get_change first to obtain the sys_id\n" +
      "- Returns state transition history for the change\n" +
      "- Tasks show progression through change workflow",

    inputSchema: GetChangeTasksInputSchema,

    execute: async ({ changeSysId }: GetChangeTasksInput) => {
      try {
        console.log(`[get_change_tasks] Fetching tasks for change: ${changeSysId}`);

        updateStatus?.(`is fetching change tasks...`);

        // Fetch change tasks from repository
        const changeRepo = getChangeRepository();
        const tasks = await changeRepo.fetchStateTransitions(changeSysId);

        console.log(
          `[get_change_tasks] Found ${tasks.length} tasks for change ${changeSysId}`
        );

        if (tasks.length === 0) {
          return createSuccessResult({
            tasks: [],
            totalCount: 0,
            changeSysId,
            message: `No change tasks found for this change. The change may not have workflow tasks configured.`,
          });
        }

        // Extract display values
        const extractRef = (field: any) =>
          typeof field === "object" && field?.display_value
            ? field.display_value
            : field;

        return createSuccessResult({
          tasks: tasks.map((task) => ({
            sysId: task.sys_id,
            change: extractRef(task.change),
            state: extractRef(task.state),
            fromState: extractRef(task.from_state),
            toState: extractRef(task.to_state),
            createdOn: task.sys_created_on,
            createdBy: extractRef(task.sys_created_by),
          })),
          totalCount: tasks.length,
          changeSysId,
          message: `Found ${tasks.length} task(s) for this change`,
        });
      } catch (error) {
        console.error("[get_change_tasks] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve change tasks from ServiceNow",
          { changeSysId }
        );
      }
    },
  });
}
