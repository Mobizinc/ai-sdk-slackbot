/**
 * Get Project Stories Tool
 *
 * Single-purpose tool for retrieving stories for a ServiceNow SPM Project.
 * Replaces the `servicenow_action` with action="getProjectStories"
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
 * Input schema for get_project_stories tool
 */
const GetProjectStoriesInputSchema = z.object({
  projectSysId: z
    .string()
    .describe(
      "Project sys_id (UUID) to retrieve stories for. Use get_project first to get the project's sys_id."
    ),
});

export type GetProjectStoriesInput = z.infer<typeof GetProjectStoriesInputSchema>;

/**
 * Get Project Stories Tool
 *
 * Retrieves all user stories for a specific SPM Project.
 */
export function createGetProjectStoriesTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "get_project_stories",
    description:
      "Retrieve all user stories for a specific ServiceNow SPM project. " +
      "Returns story details including description, state, priority, assignment, and story points.\n\n" +
      "**Use this tool when:**\n" +
      "- User asks for stories in a project\n" +
      "- Want to see detailed work items for a project\n" +
      "- Need to understand project backlog or sprint items\n\n" +
      "**IMPORTANT:**\n" +
      "- projectSysId is REQUIRED - use get_project first to obtain the sys_id\n" +
      "- Returns ALL stories for the project (no pagination)\n" +
      "- Stories are detailed work items typically contained within epics",

    inputSchema: GetProjectStoriesInputSchema,

    execute: async ({ projectSysId }: GetProjectStoriesInput) => {
      try {
        console.log(`[get_project_stories] Fetching stories for project: ${projectSysId}`);

        updateStatus?.(`is fetching stories for project...`);

        // Fetch project stories via repository
        const spmRepo = getSPMRepository();
        const stories = await spmRepo.findRelatedStories(projectSysId);

        console.log(`[get_project_stories] Found ${stories.length} stories for project ${projectSysId}`);

        if (stories.length === 0) {
          return createSuccessResult({
            stories: [],
            totalCount: 0,
            projectSysId,
            message: `No stories found for this project. The project may not have any user stories defined yet.`,
          });
        }

        return createSuccessResult({
          stories: stories.map((story) => ({
            sysId: story.sysId,
            number: story.number,
            shortDescription: story.shortDescription,
            description: story.description,
            state: story.state,
            priority: story.priority,
            assignedTo: story.assignedToName,
            storyPoints: story.storyPoints,
            parent: story.parentNumber,
            url: story.url,
          })),
          totalCount: stories.length,
          projectSysId,
          message: `Found ${stories.length} story/stories for this project`,
        });
      } catch (error) {
        console.error("[get_project_stories] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve project stories from ServiceNow",
          { projectSysId }
        );
      }
    },
  });
}
