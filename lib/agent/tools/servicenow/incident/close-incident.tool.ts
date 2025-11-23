/**
 * Close Incident Tool
 *
 * Single-purpose tool for closing a ServiceNow incident.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getIncidentRepository } from "@/infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

const CloseIncidentInputSchema = z.object({
  sysId: z.string().describe("Incident sys_id to close"),
  closeCode: z.string().optional().describe("Close code/resolution code"),
  closeNotes: z.string().optional().describe("Closure notes explaining resolution"),
});

export type CloseIncidentInput = z.infer<typeof CloseIncidentInputSchema>;

export function createCloseIncidentTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "close_incident",
    description:
      "Close a ServiceNow incident. Use get_incident first to obtain the sys_id.\n\n" +
      "**Use when:** Resolving and closing an incident with resolution details",

    inputSchema: CloseIncidentInputSchema,

    execute: async ({ sysId, closeCode, closeNotes }: CloseIncidentInput) => {
      try {
        updateStatus?.(`is closing incident...`);
        const incidentRepo = getIncidentRepository();
        const incident = await incidentRepo.close(sysId, closeCode, closeNotes);

        return createSuccessResult({
          incident: {
            sysId: incident.sysId,
            number: incident.number,
            shortDescription: incident.shortDescription,
            state: incident.state,
            url: incident.url,
          },
          message: `Successfully closed incident ${incident.number}`,
        });
      } catch (error) {
        console.error("[close_incident] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error ? error.message : "Failed to close incident",
          { sysId }
        );
      }
    },
  });
}
