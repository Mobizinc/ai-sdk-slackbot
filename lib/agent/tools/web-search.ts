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
    description: "Use this to search the web for information",
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
