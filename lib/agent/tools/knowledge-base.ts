/**
 * Knowledge Base Tool
 *
 * Generates knowledge base articles from resolved cases with conversation context.
 */

import { z } from "zod";
import { serviceNowClient } from "../../tools/servicenow";
import { getContextManager } from "../../context-manager";
import { getKBGenerator } from "../../services/kb-generator";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { createServiceNowContext } from "@/infrastructure/servicenow-context";

export type GenerateKBArticleInput = {
  caseNumber: string;
  threadTs?: string;
};

const generateKbArticleInputSchema = z.object({
  caseNumber: z
    .string()
    .describe("The case number to generate KB article for"),
  threadTs: z
    .string()
    .optional()
    .describe("Optional thread timestamp to get conversation context from"),
});

export function createKnowledgeBaseTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "generate_kb_article",
    description:
      "INTERNAL ONLY: Generates a knowledge base article from a resolved case using the conversation context and case details from ServiceNow. This tool requires that the case has been discussed in a tracked Slack thread to capture the problem-solving context. It analyzes the conversation history, extracts the issue description and resolution steps, checks for duplicate KB articles using similarity search, and returns a structured KB article with confidence scoring (0-100%). Use this tool ONLY when the user explicitly commands 'generate KB for [case number]' or similar direct requests. Do NOT proactively mention or suggest KB generation in your responses - this happens automatically for resolved cases through other workflows. Returns either the generated article with confidence score and similar KBs, or a duplicate detection result if similar articles already exist. This tool requires both ServiceNow and conversation context to be available.",
    inputSchema: generateKbArticleInputSchema,
    execute: async ({ caseNumber, threadTs }: GenerateKBArticleInput) => {
      try {
        updateStatus?.(`is generating KB article for ${caseNumber}...`);

        const contextManager = getContextManager();
        const contexts = contextManager.getContextsForCase(caseNumber);

        if (contexts.length === 0) {
          return {
            error: `No conversation context found for case ${caseNumber}. The case must have been discussed in a tracked thread first.`,
          };
        }

        const context = threadTs
          ? contexts.find((c) => c.threadTs === threadTs)
          : contexts[contexts.length - 1];

        if (!context) {
          return {
            error: `Context not found for the specified thread.`,
          };
        }

        // Create ServiceNow context for deterministic feature flag routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        const caseDetails = serviceNowClient.isConfigured()
          ? await serviceNowClient.getCase(caseNumber, snContext).catch(() => null)
          : null;

        const kbGenerator = getKBGenerator();
        const result = await kbGenerator.generateArticle(context, caseDetails);

        if (result.isDuplicate) {
          return {
            duplicate: true,
            similar_kbs: result.similarExistingKBs,
            message: `Similar KB articles already exist. Consider updating an existing article instead.`,
          };
        }

        return {
          success: true,
          article: result.article,
          confidence: result.confidence,
          similar_kbs: result.similarExistingKBs,
          message: `KB article generated with ${result.confidence}% confidence.`,
        };
      } catch (error) {
        console.error("KB generation error", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Failed to generate KB article",
        };
      }
    },
  });
}
