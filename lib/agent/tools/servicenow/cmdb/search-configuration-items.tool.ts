/**
 * Search Configuration Items Tool
 *
 * Single-purpose tool for searching Configuration Items (CIs) in the ServiceNow CMDB.
 * Replaces the `servicenow_action` with action="searchConfigurationItem"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getCmdbRepository } from "../../../../infrastructure/servicenow/repositories";
import { formatConfigurationItemsForLLM } from "../../../../services/servicenow-formatters";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";
import { detectTableFromPrefix } from "../../../../utils/case-number-normalizer";
import type { CoreMessage } from "../../shared";

const FIREWALL_KEYWORDS = [
  "firewall",
  "fortigate",
  "fortinet",
  "palo alto",
  "palo-alto",
  "paloalto",
  "panw",
  "pan-os",
  "checkpoint",
  "sonicwall",
  "asa",
  "meraki mx",
];

const FIREWALL_CLASS_CANDIDATES = [
  "cmdb_ci_firewall",
  "cmdb_ci_firewall_device",
  "cmdb_ci_firewall_device_palo_alto",
  "cmdb_ci_firewall_device_cisco",
  "cmdb_ci_firewall_cluster",
  "cmdb_ci_firewall_cluster_fortinet",
  "cmdb_ci_ip_firewall",
  "cmdb_ci_netgear",
];

function normalizeMessageContent(content: CoreMessage["content"] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: any) => (typeof block === "string" ? block : block?.text ?? ""))
      .join(" ");
  }
  if (typeof content === "object" && "text" in content) {
    return String((content as any).text ?? "");
  }
  return "";
}

function getLatestUserText(messages: CoreMessage[] = []): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user") {
      return normalizeMessageContent(message.content);
    }
  }
  return "";
}

function inferFirewallIntent(messageText: string): boolean {
  if (!messageText) return false;
  const lower = messageText.toLowerCase();
  return FIREWALL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

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
  const { updateStatus } = params;

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
      "- Returns summary of found CIs with key attributes\n\n" +
      "**DO NOT use this tool for ServiceNow record numbers:**\n" +
      "- SCS/CS (e.g., SCS0050980) → use get_case\n" +
      "- INC (e.g., INC0012345) → use get_incident\n" +
      "- REQ/RITM/SCTASK → use appropriate service catalog tools\n" +
      "- CHG (e.g., CHG0005678) → use get_change\n" +
      "- CTASK (e.g., CTASK0012972) → use get_change_tasks\n" +
      "- PRB (e.g., PRB0001234) → use get_problem\n" +
      "This tool is ONLY for infrastructure CIs like servers, switches, databases, and applications.",

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
        // Check if ciName is actually a ServiceNow record number (case, incident, etc.)
        // Only match if it's PREFIX followed by digits (e.g., SCS0050980, INC0012345)
        // This avoids false positives like "Incinerator-01" or "ChangeControlServer"
        if (ciName) {
          const snRecordPattern = /^(SCS|CS|INC|REQ|RITM|SCTASK|CHG|PRB|CTASK)\d{4,}$/i;
          if (snRecordPattern.test(ciName)) {
            const detectedTable = detectTableFromPrefix(ciName);
            if (detectedTable) {
              const toolMapping: Record<string, string> = {
                sn_customerservice_case: "get_case",
                incident: "get_incident",
                sc_request: "get_request",
                sc_req_item: "get_requested_item",
                sc_task: "get_catalog_task",
                change_request: "get_change",
                problem: "get_problem",
                change_task: "get_change_tasks",
              };
              const correctTool = toolMapping[detectedTable.table] || "get_case";
              return createErrorResult(
                ServiceNowErrorCodes.INVALID_INPUT,
                `"${ciName}" is a ServiceNow record number (${detectedTable.table}), not a Configuration Item name. Use the ${correctTool} tool instead to look up this record.`,
                {
                  detectedPrefix: detectedTable.prefix,
                  detectedTable: detectedTable.table,
                  suggestedTool: correctTool,
                  providedValue: ciName,
                }
              );
            }
          }
        }

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

        const latestUserText = getLatestUserText(params.messages);
        const wantsFirewalls = inferFirewallIntent(latestUserText);

        const requestedClassNames: Array<string | undefined> = [];

        // Prioritize firewall classes if the user asked about firewalls (even if the model picked "server")
        if (wantsFirewalls) {
          requestedClassNames.push(...FIREWALL_CLASS_CANDIDATES);
        }

        if (ciClassName) {
          requestedClassNames.push(ciClassName);
        }

        const classSearchOrder =
          Array.from(new Set(requestedClassNames.filter(Boolean))) || [];

        const searchPaths = classSearchOrder.length > 0 ? classSearchOrder : [undefined];
        console.log(
          `[search_configuration_items] Class search plan: ${
            searchPaths.filter(Boolean).join(", ") || "any"
          }`,
        );

        // Search configuration items via repository
        const cmdbRepo = getCmdbRepository();
        const aggregatedResults: any[] = [];
        const seenSysIds = new Set<string>();

        for (const classNameToSearch of searchPaths) {
          if (aggregatedResults.length >= limit) {
            break;
          }

          const remainingLimit = Math.max(1, limit - aggregatedResults.length);
          const searchCriteria = {
            name: ciName,
            ipAddress,
            sysId: ciSysId,
            className: classNameToSearch,
            company: companyName,
            operationalStatus: ciOperationalStatus,
            location: ciLocation,
            ownerGroup: ciOwnerGroup,
            environment: ciEnvironment,
            limit: remainingLimit,
          };

          const results = await cmdbRepo.search(searchCriteria);
          for (const ci of results) {
            const sysId = ci.sysId || ci.sys_id;
            if (sysId && seenSysIds.has(sysId)) {
              continue;
            }
            if (sysId) {
              seenSysIds.add(sysId);
            }
            aggregatedResults.push(ci);
            if (aggregatedResults.length >= limit) {
              break;
            }
          }
        }

        console.log(
          `[search_configuration_items] Found ${aggregatedResults.length} CIs matching criteria: ${criteriaDesc}`
        );

        // Convert domain models to API format for formatter
        const apiFormat = aggregatedResults.map((ci: any) => ({
          sys_id: ci.sysId,
          name: ci.name,
          sys_class_name: ci.className,
          fqdn: ci.fqdn,
          host_name: ci.hostName,
          ip_addresses: ci.ipAddresses,
          company: ci.company,
          company_name: ci.companyName,
          owner_group: ci.ownerGroup,
          support_group: ci.supportGroup,
          location: ci.location,
          environment: ci.environment,
          status: ci.status,
          description: ci.description,
          url: ci.url,
        }));

        // Format results for LLM consumption
        const formatted = formatConfigurationItemsForLLM(apiFormat as any);

        if (aggregatedResults.length === 0) {
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
          configurationItems: aggregatedResults,
          totalFound: aggregatedResults.length,
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
            aggregatedResults.length === limit
              ? `Found ${aggregatedResults.length} CIs (limit reached). If you need more results, increase the limit parameter or refine your search criteria.`
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
