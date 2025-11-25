/**
 * Get CI Relationships Tool
 *
 * Single-purpose tool for retrieving relationships for a Configuration Item in the CMDB.
 * Replaces the `servicenow_action` with action="getCIRelationships"
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

/**
 * Input schema for get_ci_relationships tool
 */
const GetCIRelationshipsInputSchema = z.object({
  ciSysId: z
    .string()
    .describe(
      "CI sys_id (UUID) to retrieve relationships for. Use search_configuration_items first to find the CI and get its sys_id."
    ),
  relationshipType: z
    .string()
    .optional()
    .describe(
      "Filter by relationship type (e.g., 'Depends on::Used by', 'Runs on::Runs', 'Contains::Contained by'). If not specified, returns all relationship types."
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe(
      "Maximum number of related CIs to return (default: 50, max: 100)"
    ),
});

export type GetCIRelationshipsInput = z.infer<
  typeof GetCIRelationshipsInputSchema
>;

/**
 * Get CI Relationships Tool
 *
 * Retrieves related Configuration Items for a specific CI from the CMDB.
 */
export function createGetCIRelationshipsTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "get_ci_relationships",
    description:
      "Retrieve related Configuration Items (CIs) for a specific CI from the ServiceNow CMDB. " +
      "Returns CIs that are connected through various relationship types (dependencies, containment, connections, etc.).\n\n" +
      "**Use this tool when:**\n" +
      "- You need to understand CI dependencies (what this CI depends on or what depends on it)\n" +
      "- Finding servers that host an application\n" +
      "- Discovering network connections between devices\n" +
      "- Understanding containment relationships (what's inside a CI)\n" +
      "- Mapping infrastructure topology\n\n" +
      "**Common Relationship Types:**\n" +
      "- 'Depends on::Used by' - Dependency relationships\n" +
      "- 'Runs on::Runs' - Application to server relationships\n" +
      "- 'Contains::Contained by' - Physical or logical containment\n" +
      "- 'Connects to::Connected by' - Network connections\n" +
      "- 'Uses::Used by' - Service usage relationships\n\n" +
      "**IMPORTANT:**\n" +
      "- ciSysId is REQUIRED - use search_configuration_items first to get the sys_id\n" +
      "- Returns both the relationship type and related CI details\n" +
      "- Default limit is 50 related CIs\n" +
      "- Filter by relationshipType to narrow down specific relationship types",

    inputSchema: GetCIRelationshipsInputSchema,

    execute: async ({
      ciSysId,
      relationshipType,
      limit = 50,
    }: GetCIRelationshipsInput) => {
      try {
        console.log(
          `[get_ci_relationships] Fetching relationships for CI: ${ciSysId}` +
            (relationshipType ? `, type="${relationshipType}"` : "") +
            `, limit=${limit}`
        );

        updateStatus?.(
          `is fetching CI relationships${relationshipType ? ` (${relationshipType})` : ""}...`
        );

        // Fetch CI relationships via repository
        const cmdbRepo = getCmdbRepository();
        const relatedCIs = await cmdbRepo.getRelatedCIs(ciSysId, relationshipType);

        console.log(
          `[get_ci_relationships] Found ${relatedCIs.length} related CIs for ${ciSysId}`
        );

        // Convert domain models to API format for formatter
        const apiFormat = relatedCIs.map((ci: any) => ({
          sys_id: ci.sysId,
          name: ci.name,
          sys_class_name: ci.className,
          company: ci.company,
          status: ci.status,
          url: ci.url,
        }));

        // Format results for LLM consumption
        const formatted = formatConfigurationItemsForLLM(apiFormat as any);

        if (relatedCIs.length === 0) {
          return createSuccessResult({
            relatedCIs: [],
            relationshipCount: 0,
            ciSysId,
            relationshipType: relationshipType || "all types",
            message: relationshipType
              ? `No related CIs found for CI ${ciSysId} with relationship type "${relationshipType}". Try searching without a relationship type filter.`
              : `No related CIs found for CI ${ciSysId}. This CI may not have any configured relationships in the CMDB.`,
          });
        }

        return createSuccessResult({
          relatedCIs: relatedCIs.map((ci: any) => ({
            sysId: ci.sys_id,
            name: ci.name,
            className: ci.sys_class_name,
            company: ci.company,
            status: ci.status,
            url: ci.url,
          })),
          relationshipCount: relatedCIs.length,
          ciSysId,
          relationshipType: relationshipType || "all types",
          summary: formatted?.summary,
          rawData: formatted?.rawData,
          message:
            relatedCIs.length === limit
              ? `Found ${relatedCIs.length} related CIs (limit reached). Increase the limit parameter to see more results.`
              : undefined,
        });
      } catch (error) {
        console.error("[get_ci_relationships] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve CI relationships from ServiceNow",
          { ciSysId, relationshipType, limit }
        );
      }
    },
  });
}
