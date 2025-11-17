/**
 * Create Project Tool
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getSPMRepository } from "@/infrastructure/servicenow/repositories";
import { createErrorResult, createSuccessResult, ServiceNowErrorCodes } from "../shared/types";

const CreateProjectInputSchema = z.object({
  shortDescription: z.string().min(5).describe("Project name/summary (required, min 5 characters)"),
  description: z.string().optional().describe("Detailed project description"),
  assignedTo: z.string().optional().describe("Assigned user"),
  assignmentGroup: z.string().optional().describe("Assignment group"),
  priority: z.string().optional().describe("Priority (1-5)"),
  parent: z.string().optional().describe("Parent project sys_id"),
  dueDate: z.string().optional().describe("Due date (ISO format)"),
  startDate: z.string().optional().describe("Start date (ISO format)"),
  projectManager: z.string().optional().describe("Project manager"),
  sponsor: z.string().optional().describe("Project sponsor"),
  portfolio: z.string().optional().describe("Portfolio sys_id"),
  lifecycleStage: z.string().optional().describe("Lifecycle stage"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export function createCreateProjectTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "create_project",
    description: "Create a new ServiceNow SPM project.",
    inputSchema: CreateProjectInputSchema,
    execute: async (input: CreateProjectInput) => {
      try {
        updateStatus?.(`is creating project...`);
        const spmRepo = getSPMRepository();
        const project = await spmRepo.create(input);

        return createSuccessResult({
          project: {
            sysId: project.sysId,
            number: project.number,
            shortDescription: project.shortDescription,
            state: project.state,
            url: project.url,
          },
          message: `Successfully created project ${project.number}`,
        });
      } catch (error) {
        console.error("[create_project] Error:", error);
        return createErrorResult(ServiceNowErrorCodes.FETCH_ERROR, error instanceof Error ? error.message : "Failed to create project", { shortDescription: input.shortDescription });
      }
    },
  });
}
