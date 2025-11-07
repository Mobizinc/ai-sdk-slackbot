/**
 * Feedback Collection Tool
 *
 * Allows users to submit feature requests and feedback, which are converted
 * into Business Requirements Documents (BRDs) and GitHub issues.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
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
      "Collects feature requests and feedback from users when they encounter missing functionality or limitations in the bot. This tool gathers structured information about what the user wants, generates a Business Requirements Document (BRD), and automatically creates a GitHub issue for tracking. Use this tool when: (1) A user explicitly requests a feature, (2) A tool/function returns an error indicating unsupported functionality, (3) A user expresses frustration about a limitation. This helps capture user needs systematically and ensures nothing gets lost. The tool will ask for: feature description, use case, and current limitation.",
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
          message: `Feature request submitted successfully! I've created GitHub issue #${issue.number} to track this request.`,
          issueNumber: issue.number,
          issueUrl: issue.htmlUrl,
          issueTitle: issue.title,
          brd: {
            problemStatement: brd.problemStatement,
            userStory: brd.userStory,
            acceptanceCriteria: brd.acceptanceCriteria,
          },
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
function buildConversationContext(messages: any[]): string {
  // Take last 5 messages to provide context without overwhelming the BRD
  const recentMessages = messages.slice(-5);

  return recentMessages
    .map((msg, idx) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      // Truncate very long messages
      const truncated = content.length > 500 ? content.substring(0, 500) + "..." : content;
      return `[${idx + 1}] ${role}: ${truncated}`;
    })
    .join("\n\n");
}
