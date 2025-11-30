/**
 * Search Project Status Tool
 *
 * Single-purpose tool for querying ServiceNow SPM Project health status.
 * Queries the project_status table to find projects by health indicators (green/yellow/red).
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getProjectStatusRepository } from "../../../../infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for search_project_status tool
 */
const SearchProjectStatusInputSchema = z.object({
  overallHealth: z
    .enum(["green", "yellow", "red"])
    .optional()
    .describe(
      "Filter by overall project health status:\n" +
      "- 'green' = On Track (healthy projects)\n" +
      "- 'yellow' = At Risk (projects needing attention)\n" +
      "- 'red' = Off Track (critical projects)"
    ),
  scheduleHealth: z
    .enum(["green", "yellow", "red"])
    .optional()
    .describe("Filter by schedule health indicator"),
  costHealth: z
    .enum(["green", "yellow", "red"])
    .optional()
    .describe("Filter by cost/budget health indicator"),
  scopeHealth: z
    .enum(["green", "yellow", "red"])
    .optional()
    .describe("Filter by scope health indicator"),
  resourcesHealth: z
    .enum(["green", "yellow", "red"])
    .optional()
    .describe("Filter by resources health indicator"),
  activeOnly: z
    .boolean()
    .optional()
    .default(true)
    .describe("Only return active (non-closed) projects. Default: true"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe("Maximum number of projects to return (default: 25, max: 100)"),
});

export type SearchProjectStatusInput = z.infer<typeof SearchProjectStatusInputSchema>;

/**
 * Search Project Status Tool
 *
 * Searches for projects by health status (green/yellow/red).
 * This is the tool to use when users ask "What projects are green?" or "Show me at-risk projects"
 */
export function createSearchProjectStatusTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "search_project_status",
    description:
      "Search ServiceNow SPM projects by health status (green/yellow/red). " +
      "Health status indicates project performance: green = On Track, yellow = At Risk, red = Off Track.\n\n" +
      "**Use this tool when:**\n" +
      "- User asks for 'green' or 'on track' projects\n" +
      "- User asks for 'yellow' or 'at risk' projects\n" +
      "- User asks for 'red' or 'off track' projects\n" +
      "- User wants to see project health dashboard\n" +
      "- Filtering by specific health indicators (schedule, cost, scope, resources)\n\n" +
      "**Query Examples:**\n" +
      "- 'projects that are green' → overallHealth: 'green'\n" +
      "- 'at risk projects' → overallHealth: 'yellow'\n" +
      "- 'off track projects' → overallHealth: 'red'\n" +
      "- 'projects with schedule issues' → scheduleHealth: 'red' or 'yellow'\n" +
      "- 'projects over budget' → costHealth: 'red'\n\n" +
      "**IMPORTANT:**\n" +
      "- Returns projects with their latest health status report\n" +
      "- Health is manually set by project managers in status reports\n" +
      "- Projects without a status report won't appear in results",

    inputSchema: SearchProjectStatusInputSchema,

    execute: async ({
      overallHealth,
      scheduleHealth,
      costHealth,
      scopeHealth,
      resourcesHealth,
      activeOnly = true,
      limit = 25,
    }: SearchProjectStatusInput) => {
      try {
        const projectStatusRepo = getProjectStatusRepository();

        // Build description of search criteria
        const criteriaDesc = [
          overallHealth && `overallHealth="${overallHealth}"`,
          scheduleHealth && `scheduleHealth="${scheduleHealth}"`,
          costHealth && `costHealth="${costHealth}"`,
          scopeHealth && `scopeHealth="${scopeHealth}"`,
          resourcesHealth && `resourcesHealth="${resourcesHealth}"`,
          activeOnly && "activeOnly=true",
        ]
          .filter(Boolean)
          .join(", ");

        console.log(
          `[search_project_status] Searching projects: ${criteriaDesc || "no filters"}, limit=${limit}`
        );

        // If user specified overall health, use the optimized findProjectsByHealth method
        if (overallHealth) {
          updateStatus?.(
            `is finding ${overallHealth} (${overallHealth === 'green' ? 'On Track' : overallHealth === 'yellow' ? 'At Risk' : 'Off Track'}) projects...`
          );

          const projects = await projectStatusRepo.findProjectsByHealth(
            overallHealth,
            activeOnly,
            limit
          );

          console.log(`[search_project_status] Found ${projects.length} ${overallHealth} projects`);

          if (projects.length === 0) {
            return createSuccessResult({
              projects: [],
              totalCount: 0,
              searchCriteria: { overallHealth, activeOnly },
              message: `No ${overallHealth} (${overallHealth === 'green' ? 'On Track' : overallHealth === 'yellow' ? 'At Risk' : 'Off Track'}) projects found.`,
            });
          }

          return createSuccessResult({
            projects: projects.map((p) => ({
              sysId: p.sysId,
              number: p.number,
              shortDescription: p.shortDescription,
              state: p.state,
              priority: p.priority,
              projectManager: p.projectManagerName,
              percentComplete: p.percentComplete,
              dueDate: p.dueDate?.toISOString(),
              url: p.url,
              health: p.latestStatus ? {
                overall: p.latestStatus.overallHealth,
                schedule: p.latestStatus.scheduleHealth,
                cost: p.latestStatus.costHealth,
                scope: p.latestStatus.scopeHealth,
                resources: p.latestStatus.resourcesHealth,
                statusDate: p.latestStatus.statusDate.toISOString(),
              } : undefined,
            })),
            totalCount: projects.length,
            searchCriteria: { overallHealth, activeOnly },
            message: `Found ${projects.length} ${overallHealth} (${overallHealth === 'green' ? 'On Track' : overallHealth === 'yellow' ? 'At Risk' : 'Off Track'}) project(s)`,
          });
        }

        // If no overall health specified, search by other health criteria
        updateStatus?.("is searching projects by health status...");

        const searchResult = await projectStatusRepo.search({
          overallHealth,
          scheduleHealth,
          costHealth,
          scopeHealth,
          resourcesHealth,
          limit,
          sortBy: "as_on",
          sortOrder: "desc",
        });

        console.log(`[search_project_status] Found ${searchResult.totalCount} status reports`);

        if (searchResult.statuses.length === 0) {
          return createSuccessResult({
            statuses: [],
            totalCount: 0,
            searchCriteria: { scheduleHealth, costHealth, scopeHealth, resourcesHealth },
            message: "No project status reports found matching criteria.",
          });
        }

        return createSuccessResult({
          statuses: searchResult.statuses.map((s) => ({
            statusNumber: s.number,
            projectSysId: s.projectSysId,
            projectName: s.projectName,
            overallHealth: s.overallHealth,
            scheduleHealth: s.scheduleHealth,
            costHealth: s.costHealth,
            scopeHealth: s.scopeHealth,
            resourcesHealth: s.resourcesHealth,
            statusDate: s.statusDate.toISOString(),
            phase: s.phase,
            url: s.url,
          })),
          totalCount: searchResult.totalCount,
          searchCriteria: { scheduleHealth, costHealth, scopeHealth, resourcesHealth },
          message: `Found ${searchResult.totalCount} project status report(s)`,
        });
      } catch (error) {
        console.error("[search_project_status] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to search project health status in ServiceNow",
          { overallHealth, scheduleHealth, costHealth, scopeHealth, resourcesHealth, limit }
        );
      }
    },
  });
}
