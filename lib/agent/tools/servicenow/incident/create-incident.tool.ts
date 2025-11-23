/**
 * Create Incident Tool
 *
 * Single-purpose tool for creating a new ServiceNow incident.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getIncidentRepository } from "@/infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for create_incident tool
 */
const CreateIncidentInputSchema = z.object({
  shortDescription: z
    .string()
    .min(5)
    .describe("Brief summary of the incident (required, min 5 characters)"),
  description: z
    .string()
    .optional()
    .describe("Detailed description of the incident"),
  caller: z
    .string()
    .optional()
    .describe("Caller name or sys_id"),
  category: z
    .string()
    .optional()
    .describe("Incident category (e.g., 'Software', 'Hardware', 'Network')"),
  priority: z
    .string()
    .optional()
    .describe("Priority (1=Critical, 2=High, 3=Moderate, 4=Low, 5=Planning)"),
  assignmentGroup: z
    .string()
    .optional()
    .describe("Assignment group name or sys_id"),
  parent: z
    .string()
    .optional()
    .describe("Parent case sys_id (for incidents created from cases)"),
});

export type CreateIncidentInput = z.infer<typeof CreateIncidentInputSchema>;

/**
 * Create Incident Tool
 *
 * Creates a new ServiceNow incident.
 */
export function createCreateIncidentTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "create_incident",
    description:
      "Create a new ServiceNow incident. Returns the created incident with its assigned number.\n\n" +
      "**Use this tool when:**\n" +
      "- User requests to create a new incident\n" +
      "- Need to escalate a case to an incident\n" +
      "- Creating incident from reported issue\n\n" +
      "**IMPORTANT:**\n" +
      "- shortDescription is REQUIRED (minimum 5 characters)\n" +
      "- Returns the new incident number (INC) and sys_id\n" +
      "- Include parent sys_id when creating from a case",

    inputSchema: CreateIncidentInputSchema,

    execute: async ({
      shortDescription,
      description,
      caller,
      category,
      priority,
      assignmentGroup,
      parent,
    }: CreateIncidentInput) => {
      try {
        console.log(`[create_incident] Creating incident: "${shortDescription}"`);

        updateStatus?.(`is creating incident...`);

        // Create incident via repository
        const incidentRepo = getIncidentRepository();
        const incident = await incidentRepo.create({
          shortDescription,
          description,
          caller,
          category,
          priority,
          assignmentGroup,
          parent,
        });

        console.log(
          `[create_incident] Created incident ${incident.number} (${incident.sysId})`
        );

        return createSuccessResult({
          incident: {
            sysId: incident.sysId,
            number: incident.number,
            shortDescription: incident.shortDescription,
            description: incident.description,
            state: incident.state,
            priority: incident.priority,
            assignmentGroup: incident.assignmentGroup,
            url: incident.url,
          },
          message: `Successfully created incident ${incident.number}`,
        });
      } catch (error) {
        console.error("[create_incident] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to create incident in ServiceNow",
          { shortDescription, category, priority }
        );
      }
    },
  });
}
