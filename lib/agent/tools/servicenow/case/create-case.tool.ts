/**
 * Create Case Tool
 *
 * Single-purpose tool for creating a new ServiceNow case.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getCaseRepository } from "@/infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

const CreateCaseInputSchema = z.object({
  shortDescription: z.string().min(5).describe("Brief summary (required, min 5 characters)"),
  description: z.string().optional().describe("Detailed description"),
  callerId: z.string().optional().describe("Caller sys_id or name"),
  contact: z.string().optional().describe("Contact sys_id or name"),
  account: z.string().optional().describe("Account sys_id or name"),
  category: z.string().optional().describe("Case category"),
  subcategory: z.string().optional().describe("Case subcategory"),
  priority: z.string().optional().describe("Priority (1-5)"),
  assignmentGroup: z.string().optional().describe("Assignment group"),
});

export type CreateCaseInput = z.infer<typeof CreateCaseInputSchema>;

export function createCreateCaseTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "create_case",
    description:
      "Create a new ServiceNow case. Returns the created case with its assigned number.\n\n" +
      "**Use when:** Creating new customer service case",

    inputSchema: CreateCaseInputSchema,

    execute: async ({ shortDescription, ...rest }: CreateCaseInput) => {
      try {
        console.log(`[create_case] Creating case: "${shortDescription}"`);
        updateStatus?.(`is creating case...`);
        const caseRepo = getCaseRepository();
        const newCase = await caseRepo.create({ shortDescription, ...rest });
        console.log(`[create_case] Created case ${newCase.number} (${newCase.sysId})`);

        return createSuccessResult({
          case: {
            sysId: newCase.sysId,
            number: newCase.number,
            shortDescription: newCase.shortDescription,
            state: newCase.state,
            url: newCase.url,
          },
          message: `Successfully created case ${newCase.number}`,
        });
      } catch (error) {
        console.error("[create_case] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error ? error.message : "Failed to create case",
          { shortDescription }
        );
      }
    },
  });
}
