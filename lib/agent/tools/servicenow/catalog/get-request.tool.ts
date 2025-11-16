/**
 * Get Request Tool
 *
 * Single-purpose tool for retrieving a ServiceNow Service Request (REQ) by its number.
 * Replaces the `servicenow_action` getCase action for REQ prefixed numbers.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getRequestRepository } from "../../../../infrastructure/servicenow/repositories";
import { createServiceNowContext } from "../../../../infrastructure/servicenow-context";
import { normalizeCaseId, findMatchingCaseNumber } from "../../../../utils/case-number-normalizer";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_request tool
 */
const GetRequestInputSchema = z.object({
  number: z
    .string()
    .describe(
      "Service Request number to retrieve (e.g., REQ0012345, or just 12345). The tool will automatically normalize the format."
    ),
});

export type GetRequestInput = z.infer<typeof GetRequestInputSchema>;

/**
 * Get Request Tool
 *
 * Retrieves a specific ServiceNow Service Request by its number.
 */
export function createGetRequestTool(params: AgentToolFactoryParams) {
  const { updateStatus, options, caseNumbers } = params;

  return createTool({
    name: "get_request",
    description:
      "Retrieve a specific ServiceNow Service Request (REQ) by its number. " +
      "Returns request details including description, state, requested for, requested items, and approval status.\n\n" +
      "**Use this tool when:**\n" +
      "- User mentions a request number with REQ prefix (e.g., 'show me REQ0012345')\n" +
      "- User asks about a service request\n" +
      "- You need to check request status or approval state\n\n" +
      "**IMPORTANT:**\n" +
      "- REQ prefix indicates a Service Request (sc_request table)\n" +
      "- For requested items (RITM), use get_requested_item tool instead\n" +
      "- For catalog tasks (SCTASK), use get_catalog_task tool instead\n" +
      "- For regular cases (SCS/CS), use get_case tool instead",

    inputSchema: GetRequestInputSchema,

    execute: async ({ number }: GetRequestInput) => {
      try {
        // First, try to find matching canonical number from context
        const matched = findMatchingCaseNumber(number, caseNumbers);
        const normalizedNumber = matched || normalizeCaseId("REQ", number);

        console.log(
          `[get_request] Looking up request: "${number}" → "${normalizedNumber}"` +
            (matched ? " (canonical match)" : " (normalized)")
        );

        updateStatus?.(`is looking up request ${normalizedNumber}...`);

        // Create ServiceNow context for routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        // Fetch request from repository
        const requestRepo = getRequestRepository();
        const request = await requestRepo.findByNumber(normalizedNumber);

        if (!request) {
          return createErrorResult(
            ServiceNowErrorCodes.NOT_FOUND,
            `Request ${normalizedNumber} was not found in ServiceNow. ` +
              `This request number may be incorrect or the request may not exist in the system.`,
            { requestedNumber: number, normalizedNumber }
          );
        }

        console.log(
          `[get_request] Found request ${request.number}: ${request.shortDescription}`
        );

        return createSuccessResult({
          request: {
            number: request.number,
            shortDescription: request.shortDescription,
            description: request.description,
            state: request.state,
            stage: request.stage,
            requestedFor: request.requestedForName,
            requestedBy: request.requestedByName,
            priority: request.priority,
            approvalState: request.approvalState,
            openedAt: request.openedAt?.toISOString(),
            closedAt: request.closedAt?.toISOString(),
            dueDate: request.dueDate?.toISOString(),
            price: request.price,
            url: request.url,
          },
        });
      } catch (error) {
        console.error("[get_request] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve request from ServiceNow",
          { number }
        );
      }
    },
  });
}
