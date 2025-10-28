/**
 * Web Search Tool
 *
 * Provides web search capabilities using the Exa API for real-time information.
 */

import { z } from "zod";
import { exa } from "../../utils";
import { createTool, type AgentToolFactoryParams } from "./shared";

export type SearchWebToolInput = {
  query: string;
  specificDomain: string | null;
};

const searchWebInputSchema = z.object({
  query: z.string(),
  specificDomain: z
    .string()
    .nullable()
    .describe(
      "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
    ),
});

export function createWebSearchTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "search_web",
    description: "Searches the web for real-time information using the Exa API with live web crawling capabilities. This tool accepts a search query and an optional specific domain to limit results to. It returns up to 3 relevant web pages with titles, URLs, and content snippets (max 1000 characters each). Use this tool when you need current information from the internet, real-time data, or information beyond your training cutoff date. You can optionally restrict searches to a specific domain if the user requests it. This tool should not be used for queries that can be answered from your existing knowledge or from internal ServiceNow data.",
    inputSchema: searchWebInputSchema,
    execute: async ({ query, specificDomain }: SearchWebToolInput) => {
      updateStatus?.(`is searching the web for ${query}...`);
      const exaClient = exa;

      if (!exaClient) {
        return { results: [] };
      }

      const { results } = await exaClient.searchAndContents(query, {
        livecrawl: "always",
        numResults: 3,
        includeDomains: specificDomain ? [specificDomain] : undefined,
      });

      return {
        results: results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.text.slice(0, 1000),
        })),
      };
    },
  });
}
