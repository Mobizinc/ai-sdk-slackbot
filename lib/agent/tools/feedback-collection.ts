/**
 * Feedback Collection Tool
 *
 * Allows users to submit feature requests and feedback, which are converted
 * into Business Requirements Documents (BRDs) and GitHub issues.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams, type CoreMessage } from "./shared";
import { generateBRD } from "../../services/brd-generator";
import { createGitHubIssue } from "../../services/github-issue-service";

export type FeedbackCollectionInput = {
  featureDescription: string;
  useCase: string;
  currentLimitation: string;
};

const feedbackCollectionInputSchema = z.object({
  featureDescription: z
    .string()
    .describe("A clear description of the feature or functionality the user is requesting"),
  useCase: z.string().describe("The specific use case or scenario where this feature would be valuable"),
  currentLimitation: z
    .string()
    .describe("What limitation, missing functionality, or problem the user is experiencing right now"),
});

export function createFeedbackCollectionTool(params: AgentToolFactoryParams) {
  const { updateStatus, messages } = params;

  return createTool({
    name: "collect_feature_feedback",
    description:
      "Collects user feature requests and creates GitHub issues with auto-generated BRDs. Use when: (1) user requests a feature, (2) tool errors indicate missing functionality, (3) user hits a limitation. Requires: feature description, use case, current limitation.",
    inputSchema: feedbackCollectionInputSchema,
    execute: async ({ featureDescription, useCase, currentLimitation }: FeedbackCollectionInput) => {
      try {
        updateStatus?.("is generating requirements document...");

        // Build conversation context from messages
        const conversationContext = buildConversationContext(messages);

        // Generate BRD using LLM
        const brd = await generateBRD({
          featureDescription,
          useCase,
          currentLimitation,
          conversationContext,
        });

        updateStatus?.("is creating GitHub issue...");

        // Create GitHub issue
        const issue = await createGitHubIssue({
          brd,
          slackThreadUrl: undefined, // Could be enhanced to include Slack thread URL
          requestedBy: "Slack User", // Could be enhanced with actual user info
        });

        return {
          success: true,
          message: `Feature request submitted successfully! Created GitHub issue #${issue.number}: ${issue.title}`,
          issueNumber: issue.number,
          issueUrl: issue.htmlUrl,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          message: `Failed to submit feature request: ${errorMessage}`,
          error: errorMessage,
        };
      }
    },
  });
}

/**
 * Builds a conversation context summary from messages
 */
function buildConversationContext(messages: CoreMessage[]): string {
  // Take last 5 messages to provide context without overwhelming the BRD
  const recentMessages = messages.slice(-5);

  return recentMessages
    .map((msg, idx) => {
      const role = msg.role === "user" ? "User" : "Assistant";

      // Extract text content specifically, avoiding verbose tool calls and images
      let content: string;
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Filter only text blocks from content array
        const textBlocks = msg.content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join(" ");
        content = textBlocks || "[non-text content]";
      } else {
        content = "[complex content]";
      }

      // Truncate very long messages
      const truncated = content.length > 500 ? content.substring(0, 500) + "..." : content;
      return `[${idx + 1}] ${role}: ${truncated}`;
    })
    .join("\n\n");
}
