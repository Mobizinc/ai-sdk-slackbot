/**
 * Get Requested Item Tool
 *
 * Single-purpose tool for retrieving a ServiceNow Requested Item (RITM) by its number.
 * Replaces the `servicenow_action` getCase action for RITM prefixed numbers.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getRequestedItemRepository } from "@/infrastructure/servicenow/repositories";
import { createServiceNowContext } from "@/infrastructure/servicenow-context";
import { normalizeCaseId, findMatchingCaseNumber } from "@/utils/case-number-normalizer";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_requested_item tool
 */
const GetRequestedItemInputSchema = z.object({
  number: z
    .string()
    .describe(
      "Requested Item number to retrieve (e.g., RITM0012345, or just 12345). The tool will automatically normalize the format."
    ),
});

export type GetRequestedItemInput = z.infer<typeof GetRequestedItemInputSchema>;

/**
 * Get Requested Item Tool
 *
 * Retrieves a specific ServiceNow Requested Item by its number.
 */
export function createGetRequestedItemTool(params: AgentToolFactoryParams) {
  const { updateStatus, options, caseNumbers } = params;

  return createTool({
    name: "get_requested_item",
    description:
      "Retrieve a specific ServiceNow Requested Item (RITM) by its number. " +
      "Returns requested item details including description, state, requested for, catalog item, and associated request.\n\n" +
      "**Use this tool when:**\n" +
      "- User mentions a requested item number with RITM prefix (e.g., 'show me RITM0012345')\n" +
      "- User asks about a specific catalog item request\n" +
      "- You need to check requested item status or fulfillment state\n\n" +
      "**IMPORTANT:**\n" +
      "- RITM prefix indicates a Requested Item (sc_req_item table)\n" +
      "- For service requests (REQ), use get_request tool instead\n" +
      "- For catalog tasks (SCTASK), use get_catalog_task tool instead\n" +
      "- For regular cases (SCS/CS), use get_case tool instead",

    inputSchema: GetRequestedItemInputSchema,

    execute: async ({ number }: GetRequestedItemInput) => {
      try {
        // First, try to find matching canonical number from context
        const matched = findMatchingCaseNumber(number, caseNumbers);
        const normalizedNumber = matched || normalizeCaseId("RITM", number);

        console.log(
          `[get_requested_item] Looking up requested item: "${number}" → "${normalizedNumber}"` +
            (matched ? " (canonical match)" : " (normalized)")
        );

        updateStatus?.(`is looking up requested item ${normalizedNumber}...`);

        // Create ServiceNow context for routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        // Fetch requested item from repository
        const requestedItemRepo = getRequestedItemRepository();
        const requestedItem = await requestedItemRepo.findByNumber(normalizedNumber);

        if (!requestedItem) {
          return createErrorResult(
            ServiceNowErrorCodes.NOT_FOUND,
            `Requested item ${normalizedNumber} was not found in ServiceNow. ` +
              `This RITM number may be incorrect or the requested item may not exist in the system.`,
            { requestedNumber: number, normalizedNumber }
          );
        }

        console.log(
          `[get_requested_item] Found requested item ${requestedItem.number}: ${requestedItem.shortDescription}`
        );

        return createSuccessResult({
          requestedItem: {
            number: requestedItem.number,
            shortDescription: requestedItem.shortDescription,
            description: requestedItem.description,
            state: requestedItem.state,
            stage: requestedItem.stage,
            catalogItem: requestedItem.catalogItemName,
            request: requestedItem.requestNumber,
            assignmentGroup: requestedItem.assignmentGroupName,
            assignedTo: requestedItem.assignedToName,
            openedAt: requestedItem.openedAt?.toISOString(),
            dueDate: requestedItem.dueDate?.toISOString(),
            closedAt: requestedItem.closedAt?.toISOString(),
            price: requestedItem.price,
            quantity: requestedItem.quantity,
            url: requestedItem.url,
          },
        });
      } catch (error) {
        console.error("[get_requested_item] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve requested item from ServiceNow",
          { number }
        );
      }
    },
  });
}
