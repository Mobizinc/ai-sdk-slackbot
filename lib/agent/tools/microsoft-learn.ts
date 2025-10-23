/**
 * Microsoft Learn Tool
 *
 * Searches official Microsoft Learn documentation for authoritative technical guidance.
 */

import { z } from "zod";
import { microsoftLearnMCP } from "../../tools/microsoft-learn-mcp";
import { createTool, type AgentToolFactoryParams } from "./shared";

export type MicrosoftLearnSearchInput = {
  query: string;
  limit?: number;
};

const microsoftLearnSearchInputSchema = z.object({
  query: z
    .string()
    .min(3)
    .describe("Microsoft Learn documentation search query"),
  limit: z
    .number()
    .min(1)
    .max(5)
    .optional()
    .describe("Maximum number of results to return (default: 3)"),
});

export function createMicrosoftLearnTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    description:
      "REQUIRED TOOL: Search official Microsoft Learn documentation for authoritative guidance. YOU MUST call this tool FIRST whenever Azure, Microsoft 365, PowerShell, Windows, Active Directory, Entra ID, Exchange, SharePoint, or ANY Microsoft product/service is mentioned in cases, conversations, or queries. This includes error messages, quota issues, configuration problems, permissions, authentication, and technical questions. Provide the query terms (including error codes/messages) and the tool will return curated Microsoft Learn articles with summaries and links.",
    inputSchema: microsoftLearnSearchInputSchema,
    execute: async ({ query, limit }: MicrosoftLearnSearchInput) => {
      try {
        updateStatus?.("is searching Microsoft Learn...");

        const results = await microsoftLearnMCP.search({
          query,
          limit: limit ?? 3,
        });

        if (results.length === 0) {
          return {
            results: [],
            message: `No Microsoft Learn documentation found for "${query}".`,
          };
        }

        return {
          results: results.map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content,
          })),
          total_found: results.length,
        };
      } catch (error) {
        console.error("[Microsoft Learn MCP] Search error:", error);
        return {
          results: [],
          message: "Error searching Microsoft Learn documentation.",
        };
      }
    },
  });
}
