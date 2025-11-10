/**
 * Describe Capabilities Tool
 *
 * Provides dynamic help information about bot capabilities by introspecting:
 * - Available agent tools (with their descriptions)
 * - Registered features from the feature registry
 *
 * This ensures help information is always up-to-date as tools and features evolve.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { FEATURE_REGISTRY, getAllFeatures } from "../feature-registry";

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
 * Tool metadata for documentation purposes
 * This will be included in the help output
 */
const AGENT_TOOL_METADATA = [
  {
    name: "getWeather",
    category: "Utilities",
    description: "Fetch real-time weather data for any location using coordinates",
    usage: "Ask about current weather conditions",
    examples: ["What's the weather in San Francisco?", "Current temperature in New York"],
  },
  {
    name: "searchWeb",
    category: "Research",
    description: "Search the web using Exa API for current information",
    usage: "Ask questions requiring current web information",
    examples: ["Search for latest Azure outages", "Find documentation for FortiGate policies"],
  },
  {
    name: "serviceNow",
    category: "Case Management",
    description: "Query ServiceNow for cases, incidents, knowledge articles, and CMDB information",
    usage: "Request case details, search KB, lookup infrastructure",
    examples: [
      "Get details for SCS0048475",
      "Search ServiceNow KB for Exchange quota",
      "Look up server-prod-01 in CMDB",
    ],
  },
  {
    name: "searchSimilarCases",
    category: "Case Management",
    description: "Find similar past cases using AI-powered pattern matching",
    usage: "Look for cases similar to current issue",
    examples: ["Find similar cases to SCS0048475", "Have we seen this Exchange error before?"],
  },
  {
    name: "searchCases",
    category: "Case Management",
    description: "Advanced case search with filters (client, assignment group, date range, priority, status)",
    usage: "Search for cases with specific criteria",
    examples: [
      "Show open P1 cases for Altus",
      "Find cases assigned to Mobiz IT from last week",
      "Cases opened after November 1st with high priority",
    ],
  },
  {
    name: "generateKBArticle",
    category: "Knowledge Management",
    description: "Generate knowledge base articles from resolved cases",
    usage: "Automatic when cases are resolved, or request explicitly",
    examples: ["Create KB article for SCS0048475", "Generate documentation from this resolution"],
  },
  {
    name: "proposeContextUpdate",
    category: "Infrastructure Management",
    description: "Propose CMDB updates when infrastructure information is missing or incorrect",
    usage: "Automatic when gaps detected, or suggest updates",
    examples: ["Bot detects missing server details and proposes CMDB update"],
  },
  {
    name: "fetchCurrentIssues",
    category: "Monitoring",
    description: "Check current Microsoft service health and known outages",
    usage: "Ask about current outages or service status",
    examples: [
      "Are there any Microsoft outages right now?",
      "Check Azure service health",
      "Current M365 issues",
    ],
  },
  {
    name: "microsoftLearnSearch",
    category: "Documentation",
    description: "Search official Microsoft Learn documentation for Azure, M365, PowerShell, etc.",
    usage: "Get official Microsoft guidance on any topic",
    examples: [
      "How to request Azure quota in CSP?",
      "Microsoft guidance on Exchange mailbox quotas",
      "PowerShell commands for Entra ID user management",
    ],
  },
  {
    name: "triageCase",
    category: "Case Management",
    description: "AI-driven case classification with urgency assessment, similar cases, and KB article recommendations",
    usage: "Triage command or automatic analysis",
    examples: ["@Assistant triage SCS0048475", "Classify and analyze INC0012345"],
  },
  {
    name: "caseAggregation",
    category: "Analytics",
    description: "Analyze multiple cases for patterns, trends, and stale case detection",
    usage: "Ask for case analysis or trends",
    examples: ["Show me stale cases for Altus", "Analyze open cases by priority"],
  },
  {
    name: "getFirewallStatus",
    category: "Infrastructure Monitoring",
    description: "Query FortiManager for firewall status, policies, and configuration",
    usage: "Ask about firewall status or policies",
    examples: ["What's the status of firewall-prod-01?", "Check FortiManager policies"],
  },
  {
    name: "queryVelocloud",
    category: "Infrastructure Monitoring",
    description: "Query VeloCloud SD-WAN for edge status, connectivity, and performance metrics",
    usage: "Ask about VeloCloud edges or connectivity",
    examples: ["VeloCloud status for Site-A", "Check VeloCloud edge connectivity"],
  },
  {
    name: "collectFeatureFeedback",
    category: "Feedback",
    description: "Collect feature requests and feedback from users",
    usage: "Suggest new features or improvements",
    examples: [
      "I wish the bot could do X",
      "Feature request: track deployment schedules",
    ],
  },
];

export function createDescribeCapabilitiesTool(params: AgentToolFactoryParams) {
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
        return text.toLowerCase().includes(query.toLowerCase());
      };

      // Include agent tools
      if (scope === "all" || scope === "tools") {
        const toolsToInclude = AGENT_TOOL_METADATA.filter(
          (tool) =>
            matchesQuery(tool.name) ||
            matchesQuery(tool.description) ||
            matchesQuery(tool.category)
        );

        result.agent_tools = {
          description:
            "Tools the AI agent can use to retrieve information and perform actions",
          count: toolsToInclude.length,
          tools: toolsToInclude,
        };
      }

      // Include registered features
      if (scope === "all" || scope === "features" || scope === "category") {
        if (scope === "category" && category) {
          // Get specific category
          const categoryData = FEATURE_REGISTRY.find((c) => c.category === category);
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
