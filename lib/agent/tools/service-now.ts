/**
 * ServiceNow Tool
 *
 * Provides access to ServiceNow data including incidents, cases, knowledge base,
 * journal entries, and configuration items.
 */

import { z } from "zod";
import { serviceNowClient } from "../../tools/servicenow";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { createServiceNowContext } from "../../infrastructure/servicenow-context";

export type ServiceNowToolInput = {
  action:
    | "getIncident"
    | "getCase"
    | "getCaseJournal"
    | "searchKnowledge"
    | "searchConfigurationItem"
    | "searchCases";
  number?: string;
  caseSysId?: string;
  query?: string;
  limit?: number;
  ciName?: string;
  ipAddress?: string;
  ciSysId?: string;
  accountName?: string;
  companyName?: string;
  priority?: string;
  state?: string;
  assignmentGroup?: string;
  assignedTo?: string;
  openedAfter?: string;
  openedBefore?: string;
  activeOnly?: boolean;
  sortBy?: "opened_at" | "priority" | "updated_on" | "state";
  sortOrder?: "asc" | "desc";
};

const serviceNowInputSchema = z
  .object({
    action: z.enum([
      "getIncident",
      "getCase",
      "getCaseJournal",
      "searchKnowledge",
      "searchConfigurationItem",
      "searchCases",
    ]),
    number: z
      .string()
      .optional()
      .describe("Incident or case number to look up."),
    caseSysId: z
      .string()
      .optional()
      .describe(
        "ServiceNow case sys_id for fetching journal entries (comments, work notes).",
      ),
    query: z
      .string()
      .optional()
      .describe("Search phrase for knowledge base lookups or keyword search in case descriptions."),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of results to return. For searchCases, up to 50 results are allowed (default: 25). For searchKnowledge (knowledge articles), the maximum is 20 (default: 20)."),
    ciName: z
      .string()
      .optional()
      .describe("Configuration item name, hostname, or partial match to search for."),
    ipAddress: z
      .string()
      .optional()
      .describe("IP address associated with a configuration item."),
    ciSysId: z
      .string()
      .optional()
      .describe("Exact sys_id of the configuration item to retrieve."),
    accountName: z
      .string()
      .optional()
      .describe("Filter cases by customer/account name (partial match)."),
    companyName: z
      .string()
      .optional()
      .describe("Filter cases by company name (partial match)."),
    priority: z
      .string()
      .optional()
      .describe("Filter by priority (1=Critical, 2=High, 3=Moderate, 4=Low)."),
    state: z
      .string()
      .optional()
      .describe("Filter by case state (Open, Work in Progress, Resolved, Closed, etc.)."),
    assignmentGroup: z
      .string()
      .optional()
      .describe("Filter by assignment group name (partial match)."),
    assignedTo: z
      .string()
      .optional()
      .describe("Filter by assigned user name (partial match)."),
    openedAfter: z
      .string()
      .optional()
      .describe("Filter cases opened after this date (ISO format: YYYY-MM-DD)."),
    openedBefore: z
      .string()
      .optional()
      .describe("Filter cases opened before this date (ISO format: YYYY-MM-DD)."),
    activeOnly: z
      .boolean()
      .optional()
      .describe("Only return active (open) cases (default: true if no state filter specified)."),
    sortBy: z
      .enum(["opened_at", "priority", "updated_on", "state"])
      .optional()
      .describe("Sort results by field (default: opened_at)."),
    sortOrder: z
      .enum(["asc", "desc"])
      .optional()
      .describe("Sort order: ascending or descending (default: desc)."),
  })
  .describe("ServiceNow action parameters");

export function createServiceNowTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    description:
      "Read data from ServiceNow (incidents, cases, case search with filters, knowledge base, recent journal entries, and configuration items). " +
      "Use 'searchCases' action to find cases by customer, priority, assignment, dates, or keywords. " +
      "Use 'getCase' action only when you have a specific case number.",
    inputSchema: serviceNowInputSchema,
    execute: async ({
      action,
      number,
      caseSysId,
      query,
      limit,
      ciName,
      ipAddress,
      ciSysId,
      accountName,
      companyName,
      priority,
      state,
      assignmentGroup,
      assignedTo,
      openedAfter,
      openedBefore,
      activeOnly,
      sortBy,
      sortOrder,
    }: ServiceNowToolInput) => {
      if (!serviceNowClient.isConfigured()) {
        return {
          error:
            "ServiceNow integration is not configured. Set SERVICENOW_INSTANCE_URL and credentials to enable this tool.",
        };
      }

      // Create ServiceNow context for deterministic feature flag routing
      const snContext = createServiceNowContext(undefined, options?.channelId);

      try {
        if (action === "getIncident") {
          if (!number) {
            throw new Error(
              "number is required to retrieve a ServiceNow incident.",
            );
          }

          updateStatus?.(`is looking up incident ${number} in ServiceNow...`);

          const incident = await serviceNowClient.getIncident(number, snContext);
          if (!incident) {
            console.log(`[ServiceNow] Incident ${number} not found, trying case table...`);
            updateStatus?.(`is looking up ${number} in case table...`);

            const caseRecord = await serviceNowClient.getCase(number, snContext);
            if (caseRecord) {
              console.log(`[ServiceNow] Found ${number} in case table (fallback from incident)`);
              return { case: caseRecord };
            }

            return {
              incident: null,
              message: `Incident ${number} was not found in ServiceNow. This case number may be incorrect or the incident may not exist in the system.`,
            };
          }

          return { incident };
        }

        if (action === "getCase") {
          if (!number) {
            throw new Error(
              "number is required to retrieve a ServiceNow case.",
            );
          }

          updateStatus?.(`is looking up case ${number} in ServiceNow...`);

          const caseRecord = await serviceNowClient.getCase(number, snContext);

          if (!caseRecord) {
            console.log(`[ServiceNow] Case ${number} not found, trying incident table...`);
            updateStatus?.(`is looking up ${number} in incident table...`);

            const incident = await serviceNowClient.getIncident(number, snContext);
            if (incident) {
              console.log(`[ServiceNow] Found ${number} in incident table (fallback from case)`);
              return { incident };
            }

            return {
              case: null,
              message: `Case ${number} was not found in ServiceNow. This case number may be incorrect or the case may not exist in the system.`,
            };
          }

          return { case: caseRecord };
        }

        if (action === "getCaseJournal") {
          if (!caseSysId && !number) {
            throw new Error(
              "Provide either caseSysId or number to retrieve journal entries.",
            );
          }

          let sysId = caseSysId ?? null;

          if (!sysId && number) {
            const caseRecord = await serviceNowClient.getCase(number, snContext);
            sysId = caseRecord?.sys_id ?? null;

            if (!sysId) {
              return {
                entries: [],
                message: `Case ${number} was not found in ServiceNow or does not have a sys_id accessible to the assistant.`,
              };
            }
          }

          updateStatus?.(`is fetching journal entries for ${number ?? caseSysId}...`);

          const journal = await serviceNowClient.getCaseJournal(
            sysId!,
            { limit: limit ?? 20 },
            snContext,
          );

          return {
            entries: journal,
            total: journal.length,
          };
        }

        if (action === "searchKnowledge") {
          if (!query) {
            throw new Error(
              "query is required to search knowledge base articles.",
            );
          }

          updateStatus?.(`is searching knowledge base for ${query}...`);

          const articles = await serviceNowClient.searchKnowledge(
            {
              query,
              limit: limit ?? 10,
            },
            snContext,
          );

          return {
            articles,
            total_found: articles.length,
          };
        }

        if (action === "searchConfigurationItem") {
          if (!ciName && !ipAddress && !ciSysId) {
            throw new Error(
              "Provide ciName, ipAddress, or ciSysId to search for a configuration item.",
            );
          }

          updateStatus?.(`is searching configuration items...`);

          const results = await serviceNowClient.searchConfigurationItems(
            {
              name: ciName,
              ipAddress,
              sysId: ciSysId,
              limit: limit ?? 10,
            },
            snContext,
          );

          return {
            configuration_items: results,
            total_found: results.length,
          };
        }

        if (action === "searchCases") {
          updateStatus?.(`is searching ServiceNow cases${companyName ? ` for ${companyName}` : ""}...`);

          const filters = {
            query,
            limit,
            ciName,
            ipAddress,
            accountName,
            companyName,
            priority,
            state,
            assignmentGroup,
            assignedTo,
            openedAfter,
            openedBefore,
            activeOnly,
            sortBy,
            sortOrder,
          };

          const results = await serviceNowClient.searchCustomerCases(filters, snContext);

          return {
            cases: results,
            total_found: results.length,
            applied_filters: filters,
          };
        }

        return {
          error: `Unsupported action: ${action}`,
        };
      } catch (error) {
        console.error("[ServiceNow Tool] Error:", error);
        return {
          error:
            error instanceof Error ? error.message : "ServiceNow operation failed",
        };
      }
    },
  });
}
