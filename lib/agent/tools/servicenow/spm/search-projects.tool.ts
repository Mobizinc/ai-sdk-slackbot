/**
 * Search Projects Tool
 *
 * Single-purpose tool for searching ServiceNow SPM Projects with flexible filtering.
 * Replaces the `servicenow_action` with action="searchProjects"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getSPMRepository } from "../../../../infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for search_projects tool
 */
const SearchProjectsInputSchema = z.object({
  projectName: z
    .string()
    .optional()
    .describe(
      "Search by project name or description (supports partial matching, e.g., 'Migration' will match 'Azure Migration Project')"
    ),
  projectState: z
    .string()
    .optional()
    .describe(
      "Filter by project state. Values: 'Pending' (-5), 'Open' (-4), 'Work in Progress' (-3), 'On Hold' (-2), 'Closed Complete' (0), 'Closed Incomplete' (1), 'Closed Cancelled' (2)"
    ),
  projectPriority: z
    .string()
    .optional()
    .describe(
      "Filter by project priority. Values: '1' (Critical), '2' (High), '3' (Moderate), '4' (Low), '5' (Planning)"
    ),
  projectManager: z
    .string()
    .optional()
    .describe(
      "Filter by project manager name (supports partial matching)"
    ),
  projectActiveOnly: z
    .boolean()
    .optional()
    .describe(
      "Only return active (non-closed) projects. Default: false (returns all projects)"
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe(
      "Maximum number of projects to return (default: 25, max: 100)"
    ),
});

export type SearchProjectsInput = z.infer<typeof SearchProjectsInputSchema>;

/**
 * Search Projects Tool
 *
 * Searches ServiceNow SPM projects with flexible filtering.
 */
export function createSearchProjectsTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "search_projects",
    description:
      "Search ServiceNow SPM (Strategic Portfolio Management) projects with flexible filtering. " +
      "Returns projects matching the search criteria, sorted by opened date (newest first).\n\n" +
      "**Use this tool when:**\n" +
      "- User asks for a list of projects\n" +
      "- Looking for projects by name or keyword\n" +
      "- Filtering projects by state, priority, or manager\n" +
      "- Finding active/open projects\n\n" +
      "**Query Examples:**\n" +
      "- 'migration projects' → projectName: 'migration'\n" +
      "- 'open projects' → projectState: 'Open' or projectActiveOnly: true\n" +
      "- 'high priority projects' → projectPriority: '2'\n" +
      "- 'projects managed by John' → projectManager: 'John'\n" +
      "- 'in progress projects' → projectState: 'Work in Progress'\n\n" +
      "**IMPORTANT:**\n" +
      "- All filters are optional (returns all projects if no filters)\n" +
      "- Multiple filters are combined with AND logic\n" +
      "- Results sorted by opened date (newest first)\n" +
      "- Default limit: 25 projects",

    inputSchema: SearchProjectsInputSchema,

    execute: async ({
      projectName,
      projectState,
      projectPriority,
      projectManager,
      projectActiveOnly,
      limit = 25,
    }: SearchProjectsInput) => {
      try {
        // Build search criteria
        const criteria: any = {
          limit,
          sortBy: "opened_at",
          sortOrder: "desc",
        };

        if (projectName) criteria.query = projectName;
        if (projectState) criteria.state = projectState;
        if (projectPriority) criteria.priority = projectPriority;
        if (projectManager) criteria.projectManager = projectManager;
        if (projectActiveOnly !== undefined) criteria.activeOnly = projectActiveOnly;

        const criteriaDesc = [
          projectName && `name="${projectName}"`,
          projectState && `state="${projectState}"`,
          projectPriority && `priority="${projectPriority}"`,
          projectManager && `manager="${projectManager}"`,
          projectActiveOnly && "activeOnly=true",
        ]
          .filter(Boolean)
          .join(", ");

        console.log(
          `[search_projects] Searching projects: ${criteriaDesc || "no filters"}, limit=${limit}`
        );

        updateStatus?.(
          `is searching SPM projects${projectName ? ` for "${projectName}"` : ""}...`
        );

        // Search projects via repository
        const spmRepo = getSPMRepository();
        const searchResults = await spmRepo.search(criteria);

        console.log(
          `[search_projects] Found ${searchResults.totalCount} projects`
        );

        if (searchResults.totalCount === 0) {
          return createSuccessResult({
            projects: [],
            totalCount: 0,
            searchCriteria: criteria,
            message: `No projects found matching criteria${criteriaDesc ? `: ${criteriaDesc}` : ""}. Try broadening your search.`,
          });
        }

        return createSuccessResult({
          projects: searchResults.projects.map((p) => ({
            sysId: p.sysId,
            number: p.number,
            shortDescription: p.shortDescription,
            state: p.state,
            priority: p.priority,
            assignedTo: p.assignedToName,
            projectManager: p.projectManagerName,
            percentComplete: p.percentComplete,
            dueDate: p.dueDate?.toISOString(),
            url: p.url,
          })),
          totalCount: searchResults.totalCount,
          searchCriteria: criteria,
          message: `Found ${searchResults.totalCount} project(s) matching criteria`,
        });
      } catch (error) {
        console.error("[search_projects] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to search projects in ServiceNow",
          { projectName, projectState, projectPriority, projectManager, limit }
        );
      }
    },
  });
}
