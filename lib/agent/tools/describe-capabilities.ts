/**
 * Describe Capabilities Tool
 *
 * Provides dynamic help information about bot capabilities by introspecting:
 * - Available agent tools (by reading their actual definitions)
 * - Registered features from the feature registry
 *
 * This ensures help information is always up-to-date as tools and features evolve.
 * Tools are introspected at runtime - no hardcoded metadata needed!
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { FEATURE_REGISTRY } from "../feature-registry";
import type { AnthropicToolDefinition } from "./anthropic-tools";

export type DescribeCapabilitiesInput = {
  scope?: "all" | "tools" | "features" | "category";
  category?: string;
  query?: string;
};

const describeCapabilitiesInputSchema = z.object({
  scope: z
    .enum(["all", "tools", "features", "category"])
    .optional()
    .describe("What to describe: 'all' (default), 'tools' (only agent tools), 'features' (only registered features), 'category' (specific category)"),
  category: z
    .string()
    .optional()
    .describe("When scope is 'category', specify which category (e.g., 'Project Management', 'Case Management')"),
  query: z
    .string()
    .optional()
    .describe("Optional search query to filter capabilities"),
});

/**
 * Tool categories for better organization
 * Maps tool names to logical categories
 */
const TOOL_CATEGORIES: Record<string, string> = {
  describeCapabilities: "Help",
  getWeather: "Utilities",
  searchWeb: "Research",
  serviceNow: "Case Management",
  searchSimilarCases: "Case Management",
  searchCases: "Case Management",
  generateKBArticle: "Knowledge Management",
  proposeContextUpdate: "Infrastructure Management",
  searchCMDB: "Infrastructure Management",
  createConfigurationItem: "Infrastructure Management",
  fetchCurrentIssues: "Monitoring",
  microsoftLearnSearch: "Documentation",
  triageCase: "Case Management",
  caseAggregation: "Analytics",
  getFirewallStatus: "Infrastructure Monitoring",
  queryVelocloud: "Infrastructure Monitoring",
  collectFeatureFeedback: "Feedback",
};

/**
 * Creates the describe capabilities tool with access to all registered tools
 *
 * @param params - Standard tool factory params
 * @param getTools - Function that returns all registered tools for introspection
 */
export function createDescribeCapabilitiesTool(
  params: AgentToolFactoryParams,
  getTools?: () => Record<string, AnthropicToolDefinition>
) {
  const { updateStatus } = params;

  return createTool({
    name: "describe_capabilities",
    description:
      "Provides comprehensive information about bot capabilities including agent tools, interactive features, slash commands, and more. Use this tool when users ask about what the bot can do, available features, how to use the bot, or request help. The tool dynamically discovers available capabilities ensuring information is always current.",
    inputSchema: describeCapabilitiesInputSchema,
    execute: async ({ scope = "all", category, query }: DescribeCapabilitiesInput) => {
      updateStatus?.("is gathering capability information...");

      const result: any = {
        bot_identity: {
          name: "Mobiz Service Desk Assistant",
          role: "AI co-pilot for technical support",
          description:
            "Senior engineer assistant that monitors conversations, provides troubleshooting guidance, looks up case information, and helps with ServiceNow, Azure, and M365 issues",
        },
      };

      // Filter by query if provided
      const matchesQuery = (text: string) => {
        if (!query) return true;
        return text.toLowerCase().indexOf(query.toLowerCase()) !== -1;
      };

      // Introspect agent tools at runtime
      if (scope === "all" || scope === "tools") {
        const tools = getTools ? getTools() : {};
        const toolsArray = Object.entries(tools)
          .filter(([name]) => name !== "describe_capabilities") // Don't include self
          .map(([name, tool]) => ({
            name,
            category: TOOL_CATEGORIES[name] || "Other",
            description: tool.description,
            // Could also extract schema info if needed: tool.inputSchema
          }))
          .filter(
            (tool) =>
              matchesQuery(tool.name) ||
              matchesQuery(tool.description) ||
              matchesQuery(tool.category)
          );

        // Group tools by category
        const toolsByCategory: Record<string, any[]> = {};
        for (const tool of toolsArray) {
          if (!toolsByCategory[tool.category]) {
            toolsByCategory[tool.category] = [];
          }
          toolsByCategory[tool.category].push({
            name: tool.name,
            description: tool.description,
          });
        }

        result.agent_tools = {
          description:
            "Tools the AI agent can use to retrieve information and perform actions. These are dynamically discovered from registered tools.",
          total_count: toolsArray.length,
          categories: Object.entries(toolsByCategory).map(([cat, tools]) => ({
            category: cat,
            tool_count: tools.length,
            tools,
          })),
        };
      }

      // Include registered features
      if (scope === "all" || scope === "features" || scope === "category") {
        if (scope === "category" && category) {
          // Get specific category
          const categoryData = FEATURE_REGISTRY.filter((c) => c.category === category)[0];
          if (categoryData) {
            const features = categoryData.features.filter(
              (f) => matchesQuery(f.name) || matchesQuery(f.description)
            );
            result.feature_category = {
              category: categoryData.category,
              description: categoryData.description,
              count: features.length,
              features,
            };
          }
        } else {
          // Get all features grouped by category
          const categories = FEATURE_REGISTRY.map((cat) => ({
            category: cat.category,
            description: cat.description,
            feature_count: cat.features.filter(
              (f) => matchesQuery(f.name) || matchesQuery(f.description)
            ).length,
            features: cat.features.filter(
              (f) => matchesQuery(f.name) || matchesQuery(f.description)
            ),
          })).filter((cat) => cat.feature_count > 0);

          result.feature_categories = {
            description:
              "Additional bot features organized by category (slash commands, interactive features, automation)",
            total_categories: categories.length,
            total_features: categories.reduce((sum, cat) => sum + cat.feature_count, 0),
            categories,
          };
        }
      }

      // Add usage guidance
      if (scope === "all") {
        result.how_to_use = {
          in_channels: {
            description: "How to interact with the bot in public/private channels",
            methods: [
              "@mention the bot with your question or request",
              "Bot monitors passively - detects case numbers automatically",
              "Use triage command: @Assistant triage [case_number]",
            ],
          },
          direct_messages: {
            description: "How to interact with the bot in DMs",
            methods: [
              "No @mention needed - just send messages directly",
              "Ask questions naturally",
              "Request case details or troubleshooting help",
            ],
          },
          slash_commands: {
            description: "Slash commands for specific workflows",
            commands: [
              "/project-initiate - Start a new project",
              "/project-post - Announce a project",
              "/project-standup - Trigger standup collection",
              "/project-evaluate - Evaluate project outcomes",
            ],
          },
        };

        result.tips = [
          "Be specific with case numbers (SCS, CS, INC, RITM, REQ, CHG, PRB, SCTASK)",
          "Ask follow-up questions - bot maintains conversation context",
          "@mention bot if it can help move troubleshooting forward",
          "Provide context about what you've already tried for better suggestions",
          "Use interactive buttons and reactions when prompted",
          "DM the bot for private conversations or sensitive topics",
        ];
      }

      return result;
    },
  });
}
