/**
 * Close Case Tool
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getCaseRepository } from "../../../../infrastructure/servicenow/repositories";
import { createErrorResult, createSuccessResult, ServiceNowErrorCodes } from "../shared/types";

const CloseCaseInputSchema = z.object({
  sysId: z.string().describe("Case sys_id to close"),
  closeCode: z.string().optional().describe("Close code/resolution code"),
  closeNotes: z.string().optional().describe("Closure notes"),
});

export type CloseCaseInput = z.infer<typeof CloseCaseInputSchema>;

export function createCloseCaseTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "close_case",
    description: "Close a ServiceNow case. Use get_case first to obtain the sys_id.",
    inputSchema: CloseCaseInputSchema,
    execute: async ({ sysId, closeCode, closeNotes }: CloseCaseInput) => {
      try {
        updateStatus?.(`is closing case...`);
        const caseRepo = getCaseRepository();
        const closedCase = await caseRepo.close(sysId, closeCode, closeNotes);

        return createSuccessResult({
          case: {
            sysId: closedCase.sysId,
            number: closedCase.number,
            shortDescription: closedCase.shortDescription,
            state: closedCase.state,
            url: closedCase.url,
          },
          message: `Successfully closed case ${closedCase.number}`,
        });
      } catch (error) {
        console.error("[close_case] Error:", error);
        return createErrorResult(ServiceNowErrorCodes.FETCH_ERROR, error instanceof Error ? error.message : "Failed to close case", { sysId });
      }
    },
  });
}
