/**
 * Update Project Tool
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getSPMRepository } from "@/infrastructure/servicenow/repositories";
import { createErrorResult, createSuccessResult, ServiceNowErrorCodes } from "../shared/types";

const UpdateProjectInputSchema = z.object({
  sysId: z.string().describe("Project sys_id to update"),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  state: z.string().optional(),
  assignedTo: z.string().optional(),
  assignmentGroup: z.string().optional(),
  percentComplete: z.number().optional(),
  priority: z.string().optional(),
  dueDate: z.string().optional(),
  projectManager: z.string().optional(),
  sponsor: z.string().optional(),
  lifecycleStage: z.string().optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

export function createUpdateProjectTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "update_project",
    description: "Update an existing ServiceNow SPM project. Use get_project first to obtain the sys_id.",
    inputSchema: UpdateProjectInputSchema,
    execute: async ({ sysId, ...updates }: UpdateProjectInput) => {
      try {
        updateStatus?.(`is updating project...`);
        const spmRepo = getSPMRepository();
        const project = await spmRepo.update(sysId, updates);

        return createSuccessResult({
          project: {
            sysId: project.sysId,
            number: project.number,
            shortDescription: project.shortDescription,
            state: project.state,
            url: project.url,
          },
          message: `Successfully updated project ${project.number}`,
        });
      } catch (error) {
        console.error("[update_project] Error:", error);
        return createErrorResult(ServiceNowErrorCodes.FETCH_ERROR, error instanceof Error ? error.message : "Failed to update project", { sysId });
      }
    },
  });
}
