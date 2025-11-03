/**
 * Microsoft Learn Tool
 *
 * Searches official Microsoft Learn documentation for authoritative technical guidance.
 */

import { z } from "zod";
import { microsoftLearnMCP } from "../../tools/microsoft-learn-mcp";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { extractKeyPoints, truncateToExcerpt } from "../../utils/content-helpers";

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
    name: "search_microsoft_learn",
    description:
      "REQUIRED TOOL: Searches the official Microsoft Learn documentation to retrieve authoritative technical guidance, troubleshooting steps, and best practices directly from Microsoft's knowledge base. YOU MUST call this tool FIRST whenever any Microsoft product, service, technology, or platform is mentioned in cases, conversations, or user queries, including: Azure (all services), Microsoft 365, Office 365, PowerShell, Windows Server/Client, Active Directory, Entra ID (Azure AD), Exchange Online/On-Prem, SharePoint, Teams, Intune, Defender, and ANY other Microsoft technology. This mandatory check applies to all Microsoft-related error messages, quota/limit issues, configuration problems, permissions/authentication errors, API questions, service disruptions, feature requests, and general technical questions. The tool accepts a search query (including error codes like 'AADSTS50126' or concepts like 'Azure Function timeout') with an optional result limit (1-5, default 3). It returns up to 5 curated Microsoft Learn articles with titles, official documentation URLs, and content summaries that provide step-by-step guidance and authoritative answers. Always use this tool to ground your Microsoft-related responses in official documentation rather than relying solely on general knowledge.",
    inputSchema: microsoftLearnSearchInputSchema,
    execute: async ({ query, limit }: MicrosoftLearnSearchInput) => {
      try {
        updateStatus?.("is searching Microsoft Learn...");

        const results = await microsoftLearnMCP.searchDocs(query, limit ?? 3);

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
            key_points: extractKeyPoints(r.content, 3), // 2-3 bullets, max 80 chars each
            excerpt: truncateToExcerpt(r.content, 150), // 150 chars
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
