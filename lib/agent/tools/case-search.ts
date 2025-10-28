/**
 * Case Search Tool
 *
 * Agent tool for searching ServiceNow cases with flexible filtering.
 * Supports natural language queries like:
 * - "show open cases for Altus"
 * - "cases assigned to me"
 * - "high priority tickets in IT Support queue"
 * - "cases opened last week"
 */

import { z } from "zod";
import { caseSearchService, type CaseSearchFilters } from "../../services/case-search-service";
import { buildSearchResultsMessage } from "../../services/case-search-ui-builder";
import { createTool, type AgentToolFactoryParams } from "./shared";

/**
 * Input schema for case search tool
 */
const CaseSearchInputSchema = z.object({
  // Entity filters
  customer: z.string().optional().describe("Customer or company name to filter by"),
  assignmentGroup: z.string().optional().describe("Assignment group or queue name"),
  assignedTo: z.string().optional().describe("Assignee name or 'me' for current user"),

  // Attribute filters
  priority: z.string().optional().describe("Priority level (1=critical, 2=high, 3=moderate, 4=low, 5=planning)"),
  state: z.string().optional().describe("Case state (Open, In Progress, Resolved, Closed, etc.)"),

  // Text search
  keyword: z.string().optional().describe("Search keyword in case description"),

  // Date filters (ISO 8601 strings)
  openedAfter: z.string().optional().describe("Show cases opened after this date (YYYY-MM-DD)"),
  openedBefore: z.string().optional().describe("Show cases opened before this date (YYYY-MM-DD)"),

  // Boolean flags
  activeOnly: z.boolean().optional().describe("Only show active/open cases (default: true)"),

  // Sorting
  sortBy: z.enum(["opened_at", "priority", "updated_on", "state"]).optional().describe(
    "Sort field (opened_at=oldest/newest, priority=by priority, updated_on=recently updated)"
  ),
  sortOrder: z.enum(["asc", "desc"]).optional().describe(
    "Sort direction (asc=ascending/oldest first, desc=descending/newest first)"
  ),

  // Pagination
  limit: z.number().min(1).max(50).optional().describe("Max results to return (default: 10, max: 50)"),
  offset: z.number().min(0).optional().describe("Skip N results for pagination (default: 0)"),
});

export type CaseSearchInput = z.infer<typeof CaseSearchInputSchema>;

/**
 * Case Search Tool
 */
export function createCaseSearchTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "search_cases",
    description: `Search ServiceNow cases with flexible filtering. Use this tool for queries like:
- "show open cases for Altus"
- "cases assigned to John Doe"
- "high priority tickets"
- "cases in IT Support queue"
- "cases opened last week"
- "search for email sync issues"

Returns paginated results with Slack-formatted display. Supports sorting and filtering by customer, queue, assignee, priority, state, keywords, and dates.`,

    inputSchema: CaseSearchInputSchema,

    execute: async (input: CaseSearchInput) => {
      console.log('[Case Search Tool] Executing search with filters:', input);

      updateStatus?.("is searching cases...");

      try {
        // Convert input to filters
        const filters: CaseSearchFilters = {
          accountName: input.customer,
          assignmentGroup: input.assignmentGroup,
          assignedTo: input.assignedTo,
          priority: input.priority,
          state: input.state,
          query: input.keyword,
          openedAfter: input.openedAfter,
          openedBefore: input.openedBefore,
          activeOnly: input.activeOnly !== false, // Default true
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
          limit: input.limit || 10,
          offset: input.offset || 0,
        };

        // Execute search with metadata
        const result = await caseSearchService.searchWithMetadata(filters);

        console.log(
          `[Case Search Tool] Found ${result.totalFound} cases ` +
          `(showing ${result.cases.length}, hasMore: ${result.hasMore})`
        );

        // Build Slack display
        const display = buildSearchResultsMessage(result);

        return {
          success: true,
          result: {
            cases: result.cases.map((c) => ({
              number: c.number,
              short_description: c.shortDescription,
              priority: c.priority,
              state: c.state,
              assigned_to: c.assignedTo,
              assignment_group: c.assignmentGroup,
              age_days: c.ageDays,
              url: c.url,
            })),
            total_found: result.totalFound,
            has_more: result.hasMore,
            next_offset: result.nextOffset,
          },
          display,
        };
      } catch (error) {
        console.error('[Case Search Tool] Search failed:', error);

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });
}
