/**
 * Search Tool (Similar Cases)
 *
 * Searches Azure AI Search for similar historical cases to help with issue resolution.
 */

import { z } from "zod";
import { azureSearchService, createTool, type AgentToolFactoryParams } from "./shared";

export type SearchSimilarCasesInput = {
  query: string;
  clientId?: string;
  topK?: number;
};

const searchSimilarCasesInputSchema = z.object({
  query: z
    .string()
    .describe("The case description or issue text to find similar cases for"),
  clientId: z
    .string()
    .optional()
    .describe("Optional client/company identifier to filter results to a specific customer"),
  topK: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of similar cases to return (default: 5)"),
});

export function createSearchTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "search_similar_cases",
    description:
      "Search Azure AI Search for similar cases. Use when the user is investigating a case or wants historical incidents.",
    inputSchema: searchSimilarCasesInputSchema,
    execute: async ({ query, clientId, topK }: SearchSimilarCasesInput) => {
      const service = azureSearchService;

      if (!service) {
        return {
          similar_cases: [],
          message: "Azure Search is not configured.",
        };
      }

      updateStatus?.(`is searching for similar cases to "${query}"...`);

      try {
        const results = await service.searchSimilarCases(query, {
          topK: topK ?? 5,
          clientId,
        });

        if (results.length === 0) {
          return {
            similar_cases: [],
            message: "No similar cases found.",
          };
        }

        return {
          similar_cases: results.map((r) => ({
            case_number: r.case_number,
            similarity_score: r.score,
            content_preview: r.content.substring(0, 300) + (r.content.length > 300 ? "..." : ""),
            created_at: r.created_at,
          })),
          total_found: results.length,
        };
      } catch (error) {
        console.error("[searchSimilarCases] Error:", error);
        return {
          similar_cases: [],
          message: "No similar cases found.",
        };
      }
    },
  });
}
