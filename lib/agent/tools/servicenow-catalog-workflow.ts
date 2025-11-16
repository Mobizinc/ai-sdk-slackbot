/**
 * ServiceNow Catalog Workflow Tool
 *
 * Provides retrieval capabilities for ServiceNow service catalog workflow records:
 * - Requests (REQ)
 * - Requested Items (RITM)
 * - Catalog Tasks (CTASK)
 *
 * This tool follows the single conversational agent + tools pattern as defined
 * in agent-architecture.md. The conversational agent invokes this tool when
 * users request information about catalog workflow records.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import {
  getRequestRepository,
  getRequestedItemRepository,
  getCatalogTaskRepository,
} from "../../infrastructure/servicenow/repositories/factory";

/**
 * Input schema for catalog workflow retrieval actions
 */
export type CatalogWorkflowToolInput = {
  action: "getRequest" | "getRequestedItem" | "getCatalogTask";
  number: string; // REQ0043549, RITM0046210, or CTASK0049921
};

const catalogWorkflowInputSchema = z.object({
  action: z.enum(["getRequest", "getRequestedItem", "getCatalogTask"], {
    description: "The type of catalog workflow record to retrieve",
  }),
  number: z.string({
    description: "The record number (e.g., REQ0043549, RITM0046210, CTASK0049921)",
  }),
});

/**
 * Create the ServiceNow Catalog Workflow tool
 *
 * This tool allows the conversational agent to retrieve catalog workflow records
 * when users mention them in messages or explicitly request their details.
 */
export function createServiceNowCatalogWorkflowTool(params: AgentToolFactoryParams) {
  return createTool({
    name: "get_servicenow_catalog_workflow",
    description: `Retrieve ServiceNow service catalog workflow records including Requests (REQ), Requested Items (RITM), and Catalog Tasks (CTASK).

Use this tool when:
- User mentions a REQ, RITM, or CTASK number
- User asks for status of a request, requested item, or catalog task
- You need to display catalog workflow record details

The tool returns the full record with all available fields including:
- Request: requested_for, requested_by, state, stage, approval_state, delivery details
- Requested Item: parent request, catalog item, assignment, fulfillment stage
- Catalog Task: parent RITM, parent REQ, assignment, work notes, completion status`,
    inputSchema: catalogWorkflowInputSchema,
    execute: async (input: CatalogWorkflowToolInput) => {
      const { action, number } = input;

      console.log(`[ServiceNow Catalog Workflow Tool] ${action} for ${number}`);

      try {
        if (action === "getRequest") {
          const requestRepo = getRequestRepository();
          const request = await requestRepo.findByNumber(number);

          if (!request) {
            return {
              success: false,
              error: `Request ${number} not found`,
            };
          }

          return {
            success: true,
            data: {
              type: "request",
              record: request,
            },
          };
        }

        if (action === "getRequestedItem") {
          const ritmRepo = getRequestedItemRepository();
          const requestedItem = await ritmRepo.findByNumber(number);

          if (!requestedItem) {
            return {
              success: false,
              error: `Requested Item ${number} not found`,
            };
          }

          // Optionally fetch parent request for context
          let parentRequest = null;
          if (requestedItem.request) {
            const requestRepo = getRequestRepository();
            parentRequest = await requestRepo.findBySysId(requestedItem.request);
          }

          return {
            success: true,
            data: {
              type: "requested_item",
              record: requestedItem,
              parentRequest,
            },
          };
        }

        if (action === "getCatalogTask") {
          const taskRepo = getCatalogTaskRepository();
          const catalogTask = await taskRepo.findByNumber(number);

          if (!catalogTask) {
            return {
              success: false,
              error: `Catalog Task ${number} not found`,
            };
          }

          // Optionally fetch parent RITM and grandparent REQ for context
          let parentRITM = null;
          let grandparentREQ = null;

          if (catalogTask.requestItem) {
            const ritmRepo = getRequestedItemRepository();
            parentRITM = await ritmRepo.findBySysId(catalogTask.requestItem);

            if (parentRITM?.request) {
              const requestRepo = getRequestRepository();
              grandparentREQ = await requestRepo.findBySysId(parentRITM.request);
            }
          }

          return {
            success: true,
            data: {
              type: "catalog_task",
              record: catalogTask,
              parentRITM,
              grandparentREQ,
            },
          };
        }

        return {
          success: false,
          error: `Unknown action: ${action}`,
        };
      } catch (error) {
        console.error(
          `[ServiceNow Catalog Workflow Tool] Error executing ${action} for ${number}:`,
          error,
        );

        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    },
  });
}
