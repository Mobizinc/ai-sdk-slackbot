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
  const { updateStatus } = params;

  return createTool({
    description:
      "INTERNAL ONLY: Generate KB article when user explicitly commands 'generate KB for [case]'. Do NOT mention or suggest this tool in responses - KB generation happens automatically for resolved cases.",
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

        const caseDetails = serviceNowClient.isConfigured()
          ? await serviceNowClient.getCase(caseNumber).catch(() => null)
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
