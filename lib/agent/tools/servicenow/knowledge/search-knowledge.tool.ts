/**
 * Search Knowledge Tool
 *
 * Single-purpose tool for searching ServiceNow knowledge base articles.
 * Replaces the `servicenow_action` with action="searchKnowledge"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getKnowledgeRepository } from "../../../../infrastructure/servicenow/repositories";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for search_knowledge tool
 */
const SearchKnowledgeInputSchema = z.object({
  query: z
    .string()
    .min(2)
    .describe(
      "Search query to find knowledge base articles. Can be keywords, phrases, or questions (e.g., 'password reset', 'how to configure VPN', 'email sync error')."
    ),
  limit: z
    .number()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe(
      "Maximum number of knowledge articles to return (default: 10, max: 25). Articles are ranked by relevance to the search query."
    ),
});

export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInputSchema>;

/**
 * Search Knowledge Tool
 *
 * Searches the ServiceNow knowledge base for articles matching the query.
 */
export function createSearchKnowledgeTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "search_knowledge",
    description:
      "Search the ServiceNow knowledge base for articles, guides, and solutions. " +
      "Returns relevant KB articles ranked by relevance to help answer customer questions or resolve issues.\n\n" +
      "**Use this tool when:**\n" +
      "- Customer asks a question that might be answered in the knowledge base\n" +
      "- You need to find how-to guides or troubleshooting steps\n" +
      "- Looking for documented solutions to common problems\n" +
      "- Want to reference existing documentation for a case\n\n" +
      "**Query Tips:**\n" +
      "- Use specific keywords related to the issue (e.g., 'email sync outlook')\n" +
      "- Include error messages if available (e.g., 'error 500 API timeout')\n" +
      "- Ask natural questions (e.g., 'how to reset password')\n" +
      "- Be specific about the technology or system (e.g., 'VPN Cisco AnyConnect')\n\n" +
      "**Best Practices:**\n" +
      "- Start with 10 results (default) and request more if needed\n" +
      "- Review article titles and descriptions to find the most relevant match\n" +
      "- Reference the KB article URL when sharing solutions with customers",

    inputSchema: SearchKnowledgeInputSchema,

    execute: async ({ query, limit = 10 }: SearchKnowledgeInput) => {
      try {
        console.log(
          `[search_knowledge] Searching knowledge base: query="${query}", limit=${limit}`
        );

        updateStatus?.(`is searching knowledge base for "${query}"...`);

        // Search knowledge base via repository
        const knowledgeRepo = getKnowledgeRepository();
        const articles = await knowledgeRepo.search(query, limit);

        console.log(
          `[search_knowledge] Found ${articles.length} knowledge articles for query "${query}"`
        );

        if (articles.length === 0) {
          return createSuccessResult({
            articles: [],
            totalFound: 0,
            query,
            message: `No knowledge base articles found matching "${query}". Try different keywords or a broader search query.`,
          });
        }

        return createSuccessResult({
          articles: articles.map((article) => ({
            number: article.number,
            title: article.shortDescription,
            url: article.url,
            sysId: article.sysId,
          })),
          totalFound: articles.length,
          query,
          message:
            articles.length === limit
              ? `Found ${articles.length} articles (limit reached). If you need more results, increase the limit parameter.`
              : undefined,
        });
      } catch (error) {
        console.error("[search_knowledge] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to search knowledge base in ServiceNow",
          { query, limit }
        );
      }
    },
  });
}
