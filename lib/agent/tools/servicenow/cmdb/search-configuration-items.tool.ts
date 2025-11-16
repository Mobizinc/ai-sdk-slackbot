/**
 * Search Configuration Items Tool
 *
 * Single-purpose tool for searching Configuration Items (CIs) in the ServiceNow CMDB.
 * Replaces the `servicenow_action` with action="searchConfigurationItem"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { createServiceNowContext } from "../../../../infrastructure/servicenow-context";
import { serviceNowClient } from "../../../../tools/servicenow";
import { formatConfigurationItemsForLLM } from "../../../../services/servicenow-formatters";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for search_configuration_items tool
 */
const SearchConfigurationItemsInputSchema = z.object({
  ciName: z
    .string()
    .optional()
    .describe(
      "CI name to search for (supports partial matching, e.g., 'PROD-WEB' will match 'PROD-WEB-01', 'PROD-WEB-02', etc.)"
    ),
  ipAddress: z
    .string()
    .optional()
    .describe(
      "IP address to search for (exact match, e.g., '10.50.10.25')"
    ),
  ciSysId: z
    .string()
    .optional()
    .describe(
      "CI sys_id (UUID) for exact lookup. Use this if you already have the sys_id from a previous search."
    ),
  ciClassName: z
    .string()
    .optional()
    .describe(
      "CI class/type to filter by (e.g., 'cmdb_ci_server' for servers, 'cmdb_ci_netgear' for network devices, 'cmdb_ci_database' for databases). Common values: cmdb_ci_server, cmdb_ci_linux_server, cmdb_ci_win_server, cmdb_ci_netgear, cmdb_ci_network_adapter, cmdb_ci_database, cmdb_ci_app_server, cmdb_ci_web_server"
    ),
  companyName: z
    .string()
    .optional()
    .describe(
      "Company/customer name to filter by (supports partial matching, e.g., 'Altus', 'Neighbors', 'Ma-Williams')"
    ),
  ciLocation: z
    .string()
    .optional()
    .describe(
      "Physical or cloud location to filter by (e.g., 'Chicago', 'Azure', 'AWS us-east-1', 'Data Center 1')"
    ),
  ciOwnerGroup: z
    .string()
    .optional()
    .describe(
      "Owner/support group to filter by (e.g., 'Platform Team', 'Network Operations', 'Database Admins')"
    ),
  ciEnvironment: z
    .string()
    .optional()
    .describe(
      "Environment to filter by (e.g., 'production', 'staging', 'development', 'test')"
    ),
  ciOperationalStatus: z
    .string()
    .optional()
    .describe(
      "Operational status to filter by. Common values: '1' (Operational), '2' (Non-Operational), '3' (Repair in Progress), '4' (Retired), '6' (In Maintenance)"
    ),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe(
      "Maximum number of CIs to return (default: 10, max: 50)"
    ),
});

export type SearchConfigurationItemsInput = z.infer<
  typeof SearchConfigurationItemsInputSchema
>;

/**
 * Search Configuration Items Tool
 *
 * Searches the ServiceNow CMDB for Configuration Items.
 */
export function createSearchConfigurationItemsTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "search_configuration_items",
    description:
      "Search for Configuration Items (CIs) in the ServiceNow CMDB. " +
      "Returns servers, network devices, databases, applications, and other IT assets based on search criteria.\n\n" +
      "**Use this tool when:**\n" +
      "- Customer asks about servers, network devices, or IT infrastructure\n" +
      "- You need to find assets owned by a specific company or customer\n" +
      "- Looking for CIs in a specific location or environment\n" +
      "- Need to identify devices by IP address\n" +
      "- Want to find all CIs managed by a specific team\n\n" +
      "**Natural Language Query Examples:**\n" +
      "- 'server PROD-WEB-01' → ciName: 'PROD-WEB-01', ciClassName: 'cmdb_ci_server'\n" +
      "- 'CIs in Chicago' → ciLocation: 'Chicago'\n" +
      "- 'production servers' → ciEnvironment: 'production', ciClassName: 'cmdb_ci_server'\n" +
      "- 'network devices for Network Ops' → ciClassName: 'cmdb_ci_netgear', ciOwnerGroup: 'Network Ops'\n" +
      "- 'Neighbors servers in Azure' → companyName: 'Neighbors', ciLocation: 'Azure'\n" +
      "- 'what servers does Altus have' → companyName: 'Altus', ciClassName: 'cmdb_ci_server'\n" +
      "- '10.50.10.25' → ipAddress: '10.50.10.25'\n" +
      "- 'operational servers in production' → ciClassName: 'cmdb_ci_server', ciEnvironment: 'production', ciOperationalStatus: '1'\n" +
      "- 'all CIs owned by Platform team' → ciOwnerGroup: 'Platform'\n" +
      "- 'non-operational devices' → ciOperationalStatus: '2'\n\n" +
      "**Common CI Classes:**\n" +
      "- cmdb_ci_server - Generic server\n" +
      "- cmdb_ci_linux_server - Linux server\n" +
      "- cmdb_ci_win_server - Windows server\n" +
      "- cmdb_ci_netgear - Network device\n" +
      "- cmdb_ci_network_adapter - Network adapter\n" +
      "- cmdb_ci_database - Database\n" +
      "- cmdb_ci_app_server - Application server\n" +
      "- cmdb_ci_web_server - Web server\n\n" +
      "**IMPORTANT:**\n" +
      "- At least ONE search criterion must be provided\n" +
      "- Multiple criteria are combined with AND logic (all must match)\n" +
      "- Most string fields support partial matching\n" +
      "- Returns summary of found CIs with key attributes",

    inputSchema: SearchConfigurationItemsInputSchema,

    execute: async ({
      ciName,
      ipAddress,
      ciSysId,
      ciClassName,
      companyName,
      ciLocation,
      ciOwnerGroup,
      ciEnvironment,
      ciOperationalStatus,
      limit = 10,
    }: SearchConfigurationItemsInput) => {
      try {
        // Validate that at least one search criterion is provided
        if (
          !ciName &&
          !ipAddress &&
          !ciSysId &&
          !ciClassName &&
          !companyName &&
          !ciLocation &&
          !ciOwnerGroup &&
          !ciEnvironment &&
          !ciOperationalStatus
        ) {
          return createErrorResult(
            ServiceNowErrorCodes.INVALID_INPUT,
            "At least one search criterion must be provided: ciName, ipAddress, ciSysId, ciClassName, companyName, ciLocation, ciOwnerGroup, ciEnvironment, or ciOperationalStatus.",
            {
              providedCriteria: {
                ciName,
                ipAddress,
                ciSysId,
                ciClassName,
                companyName,
                ciLocation,
                ciOwnerGroup,
                ciEnvironment,
                ciOperationalStatus,
              },
            }
          );
        }

        // Build search criteria description for logging
        const criteriaDesc = [
          ciName && `name="${ciName}"`,
          ipAddress && `ip="${ipAddress}"`,
          ciSysId && `sysId="${ciSysId}"`,
          ciClassName && `class="${ciClassName}"`,
          companyName && `company="${companyName}"`,
          ciLocation && `location="${ciLocation}"`,
          ciOwnerGroup && `ownerGroup="${ciOwnerGroup}"`,
          ciEnvironment && `env="${ciEnvironment}"`,
          ciOperationalStatus && `status="${ciOperationalStatus}"`,
        ]
          .filter(Boolean)
          .join(", ");

        console.log(
          `[search_configuration_items] Searching CIs: ${criteriaDesc}, limit=${limit}`
        );

        updateStatus?.(`is searching configuration items (${criteriaDesc})...`);

        // Create ServiceNow context for routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        // Search configuration items
        const results =
          (await serviceNowClient.searchConfigurationItems(
            {
              name: ciName,
              ipAddress,
              sysId: ciSysId,
              className: ciClassName,
              company: companyName,
              operationalStatus: ciOperationalStatus,
              location: ciLocation,
              ownerGroup: ciOwnerGroup,
              environment: ciEnvironment,
              limit,
            },
            snContext
          )) ?? [];

        console.log(
          `[search_configuration_items] Found ${results.length} CIs matching criteria: ${criteriaDesc}`
        );

        // Format results for LLM consumption
        const formatted = formatConfigurationItemsForLLM(results);

        if (results.length === 0) {
          return createSuccessResult({
            configurationItems: [],
            totalFound: 0,
            searchCriteria: {
              ciName,
              ipAddress,
              ciSysId,
              ciClassName,
              companyName,
              ciLocation,
              ciOwnerGroup,
              ciEnvironment,
              ciOperationalStatus,
            },
            message: `No configuration items found matching the search criteria: ${criteriaDesc}. Try broadening your search or using different criteria.`,
          });
        }

        return createSuccessResult({
          configurationItems: results.map((ci) => ({
            sysId: ci.sys_id,
            name: ci.name,
            className: ci.sys_class_name,
            fqdn: ci.fqdn,
            hostName: ci.host_name,
            ipAddresses: ci.ip_addresses || [],
            company: ci.company,
            companyName: ci.company_name,
            ownerGroup: ci.owner_group,
            supportGroup: ci.support_group,
            location: ci.location,
            environment: ci.environment,
            status: ci.status,
            description: ci.description,
            url: ci.url,
          })),
          totalFound: results.length,
          searchCriteria: {
            ciName,
            ipAddress,
            ciSysId,
            ciClassName,
            companyName,
            ciLocation,
            ciOwnerGroup,
            ciEnvironment,
            ciOperationalStatus,
          },
          summary: formatted?.summary,
          rawData: formatted?.rawData,
          message:
            results.length === limit
              ? `Found ${results.length} CIs (limit reached). If you need more results, increase the limit parameter or refine your search criteria.`
              : undefined,
        });
      } catch (error) {
        console.error("[search_configuration_items] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to search configuration items in ServiceNow",
          {
            ciName,
            ipAddress,
            ciSysId,
            ciClassName,
            companyName,
            ciLocation,
            ciOwnerGroup,
            ciEnvironment,
            ciOperationalStatus,
            limit,
          }
        );
      }
    },
  });
}
