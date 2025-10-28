/**
 * Current Issues Tool
 *
 * Fetches active issues affecting a customer from ServiceNow and Slack.
 */

import { z } from "zod";
import { getCurrentIssuesService } from "../../services/current-issues-service";
import { createTool, type AgentToolFactoryParams } from "./shared";

export type FetchCurrentIssuesInput = {
  channelId?: string;
  channelNameHint?: string;
};

const fetchCurrentIssuesInputSchema = z.object({
  channelId: z
    .string()
    .optional()
    .describe("Slack channel ID where the question originated."),
  channelNameHint: z
    .string()
    .optional()
    .describe("Optional channel name hint if the ID is not available."),
});

export function createCurrentIssuesTool(params: AgentToolFactoryParams) {
  const { options } = params;

  return createTool({
    name: "fetch_current_issues",
    description:
      "Retrieves real-time information about active issues and ongoing incidents currently affecting a specific customer or channel by querying both ServiceNow open cases and recent Slack thread discussions. This tool cross-references the Slack channel (identified by channel ID or name hint) with ServiceNow cases to provide a comprehensive view of all live problems impacting that customer. It returns a list of open ServiceNow cases with their status, priority, and descriptions, along with active Slack threads discussing current issues. Use this tool when users ask 'what issues are we having?', 'are there any ongoing problems?', 'current status', or similar queries about live operational issues. The tool helps provide situational awareness and prevents duplicate case creation by surfacing existing known issues. Requires a Slack channel ID (automatically provided in most contexts) and ServiceNow integration to be configured. Returns structured data including case numbers, priorities, short descriptions, and Slack thread references for ongoing discussions.",
    inputSchema: fetchCurrentIssuesInputSchema,
    execute: async ({ channelId, channelNameHint }: FetchCurrentIssuesInput) => {
      const effectiveChannelId = channelId ?? options?.channelId;

      if (!effectiveChannelId) {
        return {
          error:
            "channelId is required to fetch current issues. Provide it in the tool call or ensure the assistant has channel metadata.",
        };
      }

      const currentIssuesService = getCurrentIssuesService();
      const result = await currentIssuesService.getCurrentIssues(effectiveChannelId);

      if (channelNameHint && !result.channelName) {
        result.channelName = channelNameHint;
      }

      return {
        result,
      };
    },
  });
}
