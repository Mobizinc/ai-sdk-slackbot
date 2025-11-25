/**
 * Search Changes Tool
 *
 * Single-purpose tool for searching ServiceNow Change Requests with flexible filtering.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getChangeRepository } from "../../../../infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for search_changes tool
 */
const SearchChangesInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Search query for change description or details"
    ),
  state: z
    .string()
    .optional()
    .describe(
      "Filter by change state (e.g., 'New', 'Assess', 'Authorize', 'Scheduled', 'Implement', 'Review', 'Closed')"
    ),
  type: z
    .string()
    .optional()
    .describe(
      "Filter by change type (e.g., 'Standard', 'Normal', 'Emergency')"
    ),
  category: z
    .string()
    .optional()
    .describe(
      "Filter by change category"
    ),
  priority: z
    .string()
    .optional()
    .describe(
      "Filter by priority (1=Critical, 2=High, 3=Moderate, 4=Low)"
    ),
  risk: z
    .string()
    .optional()
    .describe(
      "Filter by risk level (e.g., 'High', 'Moderate', 'Low')"
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe(
      "Maximum number of changes to return (default: 25, max: 100)"
    ),
});

export type SearchChangesInput = z.infer<typeof SearchChangesInputSchema>;

/**
 * Search Changes Tool
 *
 * Searches ServiceNow Change Requests with flexible filtering.
 */
export function createSearchChangesTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "search_changes",
    description:
      "Search ServiceNow Change Requests with flexible filtering. " +
      "Returns changes matching the search criteria.\n\n" +
      "**Use this tool when:**\n" +
      "- Looking for changes by description or keyword\n" +
      "- Filtering changes by state, type, risk, or priority\n" +
      "- Finding emergency or standard changes\n" +
      "- Reviewing scheduled or in-progress changes\n\n" +
      "**Query Examples:**\n" +
      "- 'emergency changes' → type: 'Emergency'\n" +
      "- 'high risk changes' → risk: 'High'\n" +
      "- 'scheduled changes' → state: 'Scheduled'\n" +
      "- 'database changes' → query: 'database'\n\n" +
      "**Common States:**\n" +
      "- New, Assess, Authorize, Scheduled, Implement, Review, Closed\n\n" +
      "**Common Types:**\n" +
      "- Standard, Normal, Emergency",

    inputSchema: SearchChangesInputSchema,

    execute: async ({
      query,
      state,
      type,
      category,
      priority,
      risk,
      limit = 25,
    }: SearchChangesInput) => {
      try {
        // Build query object
        const queryObj: Record<string, any> = {};
        if (query) queryObj.short_descriptionLIKE = query;
        if (state) queryObj.state = state;
        if (type) queryObj.type = type;
        if (category) queryObj.category = category;
        if (priority) queryObj.priority = priority;
        if (risk) queryObj.risk = risk;

        const criteriaDesc = [
          query && `query="${query}"`,
          state && `state="${state}"`,
          type && `type="${type}"`,
          category && `category="${category}"`,
          priority && `priority="${priority}"`,
          risk && `risk="${risk}"`,
        ]
          .filter(Boolean)
          .join(", ");

        console.log(
          `[search_changes] Searching changes: ${criteriaDesc || "no filters"}, limit=${limit}`
        );

        updateStatus?.(
          `is searching change requests${query ? ` for "${query}"` : ""}...`
        );

        // Fetch changes from repository
        const changeRepo = getChangeRepository();
        const changes = await changeRepo.fetchChanges(queryObj, {
          maxRecords: limit,
          sysparm_display_value: "all",
        });

        console.log(
          `[search_changes] Found ${changes.length} changes`
        );

        if (changes.length === 0) {
          return createSuccessResult({
            changes: [],
            totalFound: 0,
            searchCriteria: { query, state, type, category, priority, risk },
            message: `No changes found${criteriaDesc ? ` matching: ${criteriaDesc}` : ""}. Try broadening your search.`,
          });
        }

        // Extract display values
        const extractRef = (field: any) =>
          typeof field === "object" && field?.display_value
            ? field.display_value
            : field;

        return createSuccessResult({
          changes: changes.map((change) => ({
            sysId: change.sys_id,
            number: change.number,
            shortDescription: change.short_description,
            state: extractRef(change.state),
            type: extractRef(change.type),
            priority: extractRef(change.priority),
            risk: extractRef(change.risk),
            impact: extractRef(change.impact),
            assignedTo: extractRef(change.assigned_to),
            assignmentGroup: extractRef(change.assignment_group),
            startDate: change.start_date,
            endDate: change.end_date,
          })),
          totalFound: changes.length,
          searchCriteria: { query, state, type, category, priority, risk },
          message:
            changes.length === limit
              ? `Found ${changes.length} changes (limit reached). Increase limit to see more.`
              : `Found ${changes.length} change(s) matching criteria`,
        });
      } catch (error) {
        console.error("[search_changes] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to search changes in ServiceNow",
          { query, state, type, category, priority, risk, limit }
        );
      }
    },
  });
}
