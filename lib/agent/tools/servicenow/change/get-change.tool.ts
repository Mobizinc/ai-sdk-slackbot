/**
 * Get Change Tool
 *
 * Single-purpose tool for retrieving a ServiceNow Change Request by its number.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getChangeRepository } from "@/infrastructure/servicenow/repositories";
import { normalizeCaseId, findMatchingCaseNumber } from "@/utils/case-number-normalizer";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_change tool
 */
const GetChangeInputSchema = z.object({
  number: z
    .string()
    .describe(
      "Change Request number to retrieve (e.g., CHG0012345, or just 12345). The tool will automatically normalize the format."
    ),
});

export type GetChangeInput = z.infer<typeof GetChangeInputSchema>;

/**
 * Get Change Tool
 *
 * Retrieves a specific ServiceNow Change Request by its number.
 */
export function createGetChangeTool(params: AgentToolFactoryParams) {
  const { updateStatus, caseNumbers } = params;

  return createTool({
    name: "get_change",
    description:
      "Retrieve a specific ServiceNow Change Request by its number. " +
      "Returns change details including description, state, type, risk, impact, schedules, and implementation plans.\n\n" +
      "**Use this tool when:**\n" +
      "- User mentions a change number with CHG prefix (e.g., 'show me CHG0012345')\n" +
      "- User asks about a specific change request\n" +
      "- You need to check change status, risk, or approval state\n" +
      "- Want to review implementation or rollback plans\n\n" +
      "**IMPORTANT:**\n" +
      "- CHG prefix indicates a Change Request (change_request table)\n" +
      "- For change tasks, use get_change_tasks tool\n" +
      "- For searching multiple changes, use search_changes tool",

    inputSchema: GetChangeInputSchema,

    execute: async ({ number }: GetChangeInput) => {
      try {
        // First, try to find matching canonical number from context
        const matched = findMatchingCaseNumber(number, caseNumbers);
        const normalizedNumber = matched || normalizeCaseId("CHG", number);

        console.log(
          `[get_change] Looking up change: "${number}" → "${normalizedNumber}"` +
            (matched ? " (canonical match)" : " (normalized)")
        );

        updateStatus?.(`is looking up change ${normalizedNumber}...`);

        // Fetch change from repository
        const changeRepo = getChangeRepository();
        const change = await changeRepo.fetchChangeByNumber(normalizedNumber);

        if (!change) {
          return createErrorResult(
            ServiceNowErrorCodes.NOT_FOUND,
            `Change ${normalizedNumber} was not found in ServiceNow. ` +
              `This change number may be incorrect or the change may not exist in the system.`,
            { requestedNumber: number, normalizedNumber }
          );
        }

        console.log(
          `[get_change] Found change ${change.number}: ${change.short_description}`
        );

        // Extract display values from reference fields
        const extractRef = (field: any) =>
          typeof field === "object" && field?.display_value
            ? field.display_value
            : field;

        return createSuccessResult({
          change: {
            sysId: change.sys_id,
            number: change.number,
            shortDescription: change.short_description,
            description: change.description,
            state: extractRef(change.state),
            type: extractRef(change.type),
            category: extractRef(change.category),
            subcategory: extractRef(change.subcategory),
            priority: extractRef(change.priority),
            risk: extractRef(change.risk),
            impact: extractRef(change.impact),
            assignedTo: extractRef(change.assigned_to),
            assignmentGroup: extractRef(change.assignment_group),
            requestedBy: extractRef(change.requested_by),
            startDate: change.start_date,
            endDate: change.end_date,
            workStart: change.work_start,
            workEnd: change.work_end,
            businessJustification: change.business_justification,
            implementationPlan: change.implementation_plan,
            rollbackPlan: change.rollback_plan,
            testPlan: change.test_plan,
            openedAt: change.opened_at,
            closedAt: change.closed_at,
          },
        });
      } catch (error) {
        console.error("[get_change] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve change from ServiceNow",
          { number }
        );
      }
    },
  });
}
