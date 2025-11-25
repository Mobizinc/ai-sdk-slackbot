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
import { getCaseSearchService, type CaseSearchFilters } from "../../services/case-search-service";
import { buildFilterPromptMessage, buildSearchResultsMessage } from "../../services/case-search-ui-builder";
import { createTool, type AgentToolFactoryParams } from "./shared";

/**
 * Input schema for case search tool
 */
const CaseSearchInputSchema = z.object({
  // Entity filters
  customer: z.string().optional().describe("Customer or account name to filter by (e.g., 'Ma-Williams', 'Mawilliams', 'Altus'). Use this parameter when user asks to 'filter by customer', 'list tickets for [customer]', or 'show cases for [customer]'. Supports partial name matching."),
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
  updatedAfter: z.string().optional().describe("Show cases updated after this date (YYYY-MM-DD)"),
  updatedBefore: z.string().optional().describe("Show cases updated before this date (YYYY-MM-DD) - useful for finding stale cases"),

  // Boolean flags
  activeOnly: z.boolean().optional().describe("Only show active/open cases (default: true)"),

  // Domain filtering (multi-tenant support)
  domain: z.string().optional().describe("Domain sys_id for filtering cases in multi-tenant environments"),
  includeChildDomains: z.boolean().optional().describe("Include cases from child domains (hierarchical search, default: false)"),

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
- "list tickets for Ma-Williams"
- "filter by customer Mawilliams"
- "show cases for customer X"
- "cases assigned to John Doe"
- "high priority tickets"
- "cases in IT Support queue"
- "cases opened last week"
- "cases not updated in 3 days" (use updatedBefore)
- "search for email sync issues"
- "show cases in Altus domain" (multi-tenant filtering)

IMPORTANT: When users ask to "filter by customer", "list tickets for [customer]", or "show cases for [customer]", ALWAYS extract the customer name and pass it in the 'customer' parameter.

Returns paginated results with Slack-formatted display. Supports sorting and filtering by customer, queue, assignee, priority, state, keywords, opened dates, updated dates, and domain (multi-tenant).`,

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
          updatedAfter: input.updatedAfter,
          updatedBefore: input.updatedBefore,
          activeOnly: input.activeOnly !== false, // Default true
          sysDomain: input.domain,
          includeChildDomains: input.includeChildDomains || false, // Default false
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
          limit: input.limit || 10,
          offset: input.offset || 0,
        };

        // Execute search with metadata
        const result = await getCaseSearchService().searchWithMetadata(filters);

        console.log(
          `[Case Search Tool] Found ${result.totalFound} cases ` +
          `(showing ${result.cases.length}, hasMore: ${result.hasMore})`
        );

        // Build Slack display
        let display = buildSearchResultsMessage(result);

        if (result.totalFound === 0 && filters.accountName) {
          const customerSuggestions = await getCaseSearchService().suggestCustomerNames(filters.accountName, 5);
          if (customerSuggestions.length > 0) {
            display = buildFilterPromptMessage(filters.accountName, {
              customers: customerSuggestions,
            });
          }
        }

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
