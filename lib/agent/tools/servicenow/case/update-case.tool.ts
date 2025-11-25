/**
 * Update Case Tool
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getCaseRepository } from "../../../../infrastructure/servicenow/repositories";
import { createErrorResult, createSuccessResult, ServiceNowErrorCodes } from "../shared/types";

const UpdateCaseInputSchema = z.object({
  sysId: z.string().describe("Case sys_id to update"),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  priority: z.string().optional(),
  state: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  assignmentGroup: z.string().optional(),
  assignedTo: z.string().optional(),
});

export type UpdateCaseInput = z.infer<typeof UpdateCaseInputSchema>;

export function createUpdateCaseTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "update_case",
    description: "Update an existing ServiceNow case. Use get_case first to obtain the sys_id.",
    inputSchema: UpdateCaseInputSchema,
    execute: async ({ sysId, ...updates }: UpdateCaseInput) => {
      try {
        updateStatus?.(`is updating case...`);
        const caseRepo = getCaseRepository();
        const updatedCase = await caseRepo.update(sysId, updates);

        return createSuccessResult({
          case: {
            sysId: updatedCase.sysId,
            number: updatedCase.number,
            shortDescription: updatedCase.shortDescription,
            state: updatedCase.state,
            url: updatedCase.url,
          },
          message: `Successfully updated case ${updatedCase.number}`,
        });
      } catch (error) {
        console.error("[update_case] Error:", error);
        return createErrorResult(ServiceNowErrorCodes.FETCH_ERROR, error instanceof Error ? error.message : "Failed to update case", { sysId });
      }
    },
  });
}
