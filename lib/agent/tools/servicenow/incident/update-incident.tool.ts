/**
 * Update Incident Tool
 *
 * Single-purpose tool for updating an existing ServiceNow incident.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getIncidentRepository } from "@/infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

const UpdateIncidentInputSchema = z.object({
  sysId: z.string().describe("Incident sys_id to update"),
  shortDescription: z.string().optional().describe("Updated short description"),
  description: z.string().optional().describe("Updated description"),
  state: z.string().optional().describe("Updated state"),
  priority: z.string().optional().describe("Updated priority"),
  assignmentGroup: z.string().optional().describe("Updated assignment group"),
});

export type UpdateIncidentInput = z.infer<typeof UpdateIncidentInputSchema>;

export function createUpdateIncidentTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "update_incident",
    description:
      "Update an existing ServiceNow incident. Use get_incident first to obtain the sys_id.\n\n" +
      "**Use when:** Modifying incident fields (state, priority, assignment, description)",

    inputSchema: UpdateIncidentInputSchema,

    execute: async ({ sysId, ...updates }: UpdateIncidentInput) => {
      try {
        updateStatus?.(`is updating incident...`);
        const incidentRepo = getIncidentRepository();
        const incident = await incidentRepo.update(sysId, updates);

        return createSuccessResult({
          incident: {
            sysId: incident.sysId,
            number: incident.number,
            shortDescription: incident.shortDescription,
            state: incident.state,
            url: incident.url,
          },
          message: `Successfully updated incident ${incident.number}`,
        });
      } catch (error) {
        console.error("[update_incident] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error ? error.message : "Failed to update incident",
          { sysId }
        );
      }
    },
  });
}
