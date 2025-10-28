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
      "Performs semantic search across historical support cases using Azure AI Search with vector embeddings to find tickets with similar problems or resolutions. This tool uses the case description or issue text as a query and returns up to 10 most similar past cases ranked by relevance score. Each result includes case number, similarity percentage, content preview (first 300 characters), and creation date. Use this tool when investigating a new case to find previous similar issues, identify patterns, discover proven solutions, or understand how comparable problems were resolved. You can optionally filter results by client/company ID to focus on customer-specific history. This tool requires Azure AI Search to be configured and complements ServiceNow lookups by providing semantic similarity matching rather than exact keyword search.",
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
