import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import {
  getVeloCloudService,
  resolveVeloCloudConfig,
  listAvailableVeloCloudCustomers,
  type VeloCloudEventRecord,
} from "../../services/velocloud-service";

const velocloudQuerySchema = z.object({
  query: z
    .enum(["list_edges", "edge_links", "enterprise_events"])
    .describe("Type of VeloCloud data to fetch."),
  enterpriseId: z
    .number()
    .int()
    .optional()
    .describe("Enterprise ID. Defaults to value configured in environment."),
  edgeId: z
    .number()
    .int()
    .optional()
    .describe("Edge ID. Required for edge_links queries."),
  customerName: z
    .string()
    .optional()
    .describe("Optional customer alias used to resolve multi-tenant credentials (e.g., 'allcare')."),
  lookbackMinutes: z
    .number()
    .int()
    .min(5)
    .max(1440)
    .optional()
    .describe("Time window in minutes when retrieving events. Defaults to 60."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum records to return. Defaults to 50."),
  severity: z
    .string()
    .optional()
    .describe("Filter events by severity (INFO, WARNING, ERROR)."),
});

export type VeloCloudToolInput = z.infer<typeof velocloudQuerySchema>;

export function createVeloCloudTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;
  const service = getVeloCloudService();

  return createTool({
    name: "queryVelocloud",
    description:
      "Use when an Altus-family site (Altus, Exceptional, Austin, Neighbors) reports loss of internet, phones, or general connectivity. " +
      "The ISP-managed VMware VeloCloud (TPX / TelePacific) SD-WAN appliance is the source of truth for circuit health, so call this tool to inspect edge inventory, WAN link status, and recent events. " +
      "Requires VELOCLOUD_URL plus either VELOCLOUD_API_TOKEN or VELOCLOUD_USERNAME/VELOCLOUD_PASSWORD.",
    inputSchema: velocloudQuerySchema,
    execute: async ({
      query,
      enterpriseId,
      edgeId,
      customerName,
      lookbackMinutes,
      limit,
      severity,
    }: VeloCloudToolInput) => {
      const resolved = resolveVeloCloudConfig(customerName);

      if (!resolved) {
        return {
          success: false,
          error:
            "VeloCloud credentials not configured. Set VELOCLOUD_URL plus VELOCLOUD_API_TOKEN (preferred) or VELOCLOUD_USERNAME/VELOCLOUD_PASSWORD.",
          available_customers: listAvailableVeloCloudCustomers(),
        };
      }

      const { config, resolvedCustomer } = resolved;
      const resolvedEnterprise = enterpriseId ?? config.enterpriseId;
      updateStatus?.(`Connecting to VeloCloud orchestrator at ${config.baseUrl}...`);

      switch (query) {
        case "list_edges": {
          try {
            updateStatus?.("Fetching enterprise edges...");
            const edges = await service.listEdges(config, resolvedEnterprise);
            return {
              success: true,
              query,
              enterpriseId: resolvedEnterprise ?? null,
              customer: resolvedCustomer,
              summary: service.formatEdgeSummary(edges),
              edges: sanitizeForOutput(edges),
            };
          } catch (error) {
            return formatToolError("list_edges", error);
          }
        }
        case "edge_links": {
          if (edgeId === undefined) {
            return formatToolError("edge_links", "edgeId is required for edge_links queries.");
          }

          try {
            updateStatus?.(`Fetching link status for edge ${edgeId}...`);
            const links = await service.getEdgeLinkStatus(config, {
              edgeId,
              enterpriseId: resolvedEnterprise,
            });

            return {
              success: true,
              query,
              enterpriseId: resolvedEnterprise ?? null,
              customer: resolvedCustomer,
              edgeId,
              summary: service.formatLinkSummary(links),
              links: sanitizeForOutput(links),
            };
          } catch (error) {
            return formatToolError("edge_links", error);
          }
        }
        case "enterprise_events": {
          try {
            updateStatus?.("Retrieving enterprise events...");
            const events = await service.getEnterpriseEvents(config, {
              edgeId,
              enterpriseId: resolvedEnterprise,
              lookbackMinutes,
              limit,
              severity,
            });

            return {
              success: true,
              query,
              enterpriseId: resolvedEnterprise ?? null,
              edgeId: edgeId ?? null,
              customer: resolvedCustomer,
              events: formatEvents(events, limit),
            };
          } catch (error) {
            return formatToolError("enterprise_events", error);
          }
        }
        default:
          return formatToolError(query, `Unsupported query type: ${query}`);
      }
    },
  });
}

function sanitizeForOutput<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

function formatEvents(events: VeloCloudEventRecord[], limit?: number) {
  if (!events.length) {
    return {
      summary: "No events returned for the requested window.",
      items: [],
    };
  }

  const maxItems = limit ?? 50;
  const selection = events.slice(0, maxItems);
  const items = selection.map((event) => ({
    id: event.id ?? null,
    severity: event.severity ?? "UNKNOWN",
    edgeId: event.edgeId ?? null,
    message: event.message ?? event.event ?? "",
    generatedAt: event.generated ? new Date(event.generated * 1000).toISOString() : null,
  }));

  const summaryLines = items.slice(0, 5).map((item) => {
    const edgeText = item.edgeId ? `edge ${item.edgeId}` : "enterprise";
    return `${item.severity} — ${edgeText}: ${item.message || "no message"}`;
  });

  if (selection.length > 5) {
    summaryLines.push(`...and ${selection.length - 5} more events in window`);
  }

  return {
    summary: summaryLines.join("\n"),
    items,
    total: events.length,
  };
}

function formatToolError(query: string, error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
      ? error.message
      : JSON.stringify(error);

  return {
    success: false,
    query,
    error: message,
  };
}
