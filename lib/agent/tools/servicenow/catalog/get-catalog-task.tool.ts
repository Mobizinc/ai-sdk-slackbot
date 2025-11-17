/**
 * Get Catalog Task Tool
 *
 * Single-purpose tool for retrieving a ServiceNow Catalog Task (SCTASK) by its number.
 * Replaces the `servicenow_action` getCase action for SCTASK prefixed numbers.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getCatalogTaskRepository } from "@/infrastructure/servicenow/repositories";
import { createServiceNowContext } from "@/infrastructure/servicenow-context";
import { normalizeCaseId, findMatchingCaseNumber } from "@/utils/case-number-normalizer";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_catalog_task tool
 */
const GetCatalogTaskInputSchema = z.object({
  number: z
    .string()
    .describe(
      "Catalog Task number to retrieve (e.g., SCTASK0012345, or just 12345). The tool will automatically normalize the format."
    ),
});

export type GetCatalogTaskInput = z.infer<typeof GetCatalogTaskInputSchema>;

/**
 * Get Catalog Task Tool
 *
 * Retrieves a specific ServiceNow Catalog Task by its number.
 */
export function createGetCatalogTaskTool(params: AgentToolFactoryParams) {
  const { updateStatus, options, caseNumbers } = params;

  return createTool({
    name: "get_catalog_task",
    description:
      "Retrieve a specific ServiceNow Catalog Task (SCTASK) by its number. " +
      "Returns catalog task details including description, state, assignment, and associated requested item.\n\n" +
      "**Use this tool when:**\n" +
      "- User mentions a catalog task number with SCTASK prefix (e.g., 'show me SCTASK0012345')\n" +
      "- User asks about a fulfillment task\n" +
      "- You need to check catalog task status or assignment\n\n" +
      "**IMPORTANT:**\n" +
      "- SCTASK prefix indicates a Catalog Task (sc_task table)\n" +
      "- For service requests (REQ), use get_request tool instead\n" +
      "- For requested items (RITM), use get_requested_item tool instead\n" +
      "- For regular cases (SCS/CS), use get_case tool instead",

    inputSchema: GetCatalogTaskInputSchema,

    execute: async ({ number }: GetCatalogTaskInput) => {
      try {
        // First, try to find matching canonical number from context
        const matched = findMatchingCaseNumber(number, caseNumbers);
        const normalizedNumber = matched || normalizeCaseId("SCTASK", number);

        console.log(
          `[get_catalog_task] Looking up catalog task: "${number}" → "${normalizedNumber}"` +
            (matched ? " (canonical match)" : " (normalized)")
        );

        updateStatus?.(`is looking up catalog task ${normalizedNumber}...`);

        // Create ServiceNow context for routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        // Fetch catalog task from repository
        const catalogTaskRepo = getCatalogTaskRepository();
        const catalogTask = await catalogTaskRepo.findByNumber(normalizedNumber);

        if (!catalogTask) {
          return createErrorResult(
            ServiceNowErrorCodes.NOT_FOUND,
            `Catalog task ${normalizedNumber} was not found in ServiceNow. ` +
              `This SCTASK number may be incorrect or the catalog task may not exist in the system.`,
            { requestedNumber: number, normalizedNumber }
          );
        }

        console.log(
          `[get_catalog_task] Found catalog task ${catalogTask.number}: ${catalogTask.shortDescription}`
        );

        return createSuccessResult({
          catalogTask: {
            number: catalogTask.number,
            shortDescription: catalogTask.shortDescription,
            description: catalogTask.description,
            state: catalogTask.state,
            requestedItem: catalogTask.requestItemNumber,
            request: catalogTask.requestNumber,
            assignmentGroup: catalogTask.assignmentGroupName,
            assignedTo: catalogTask.assignedToName,
            priority: catalogTask.priority,
            openedAt: catalogTask.openedAt?.toISOString(),
            dueDate: catalogTask.dueDate?.toISOString(),
            closedAt: catalogTask.closedAt?.toISOString(),
            closeNotes: catalogTask.closeNotes,
            workNotes: catalogTask.workNotes,
            active: catalogTask.active,
            url: catalogTask.url,
          },
        });
      } catch (error) {
        console.error("[get_catalog_task] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve catalog task from ServiceNow",
          { number }
        );
      }
    },
  });
}
