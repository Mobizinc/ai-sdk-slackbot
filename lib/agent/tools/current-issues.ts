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
      "Check ServiceNow and Slack for live issues affecting this customer.",
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
