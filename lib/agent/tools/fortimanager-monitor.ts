/**
 * FortiManager Monitoring Tool
 *
 * Anthropic-native tool for retrieving live firewall metrics during triage
 * Queries FortiManager API to get real-time CPU, memory, interface status, etc.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { getFortiManagerMonitorService } from "../../services/fortimanager-monitor-service";
import type { FortiManagerConfig } from "../../services/fortimanager-monitor-service";

export type FortiManagerMonitorInput = {
  deviceName: string;
  metrics?: Array<"cpu" | "memory" | "interfaces" | "sessions" | "all">;
  includeInterfaces?: boolean;
  customerName?: string;
};

const fortiManagerMonitorInputSchema = z.object({
  deviceName: z
    .string()
    .describe(
      "FortiManager device name to query (e.g., 'ALT-HOU-FW01', 'NEC-FW-HOU01'). " +
      "Map the user’s site/location to the correct firewall record before calling."
    ),
  metrics: z
    .array(z.enum(["cpu", "memory", "interfaces", "sessions", "all"]))
    .optional()
    .describe(
      "Controls which FortiManager data sets to fetch. Defaults to ['cpu', 'memory', 'sessions']. " +
      "Use 'interfaces' or includeInterfaces=true when investigating link health. 'all' pulls everything."
    ),
  includeInterfaces: z
    .boolean()
    .optional()
    .describe(
      "Shortcut for fetching interface telemetry (link state, errors, speeds). " +
      "Enables additional FortiGate proxy calls, adding a few seconds to the query."
    ),
  customerName: z
    .string()
    .optional()
    .describe(
      "Optional customer alias (e.g., 'altus', 'neighbors'). When omitted, the tool chooses the first configured FortiManager tenant."
    ),
});

/**
 * Create FortiManager monitoring tool
 */
export function createFortiManagerMonitorTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "getFirewallStatus",
    description:
      "Use when a site protected by a managed Fortinet firewall reports connectivity loss, high latency, or firewall alarms. " +
      "Queries FortiManager for the firewall’s reachability, config-sync status, and (optionally) interface health so triage can rule in/out local firewall causes. " +
      "Designed for MSP deployments where multiple customer tenants share one or more FortiManager instances.",
    inputSchema: fortiManagerMonitorInputSchema,
    execute: async ({
      deviceName,
      metrics = ["cpu", "memory", "sessions"],
      includeInterfaces = false,
      customerName,
    }: FortiManagerMonitorInput) => {
      try {
        updateStatus?.(`Querying FortiManager for ${deviceName} health...`);

        const configLookup = getFortiManagerConfigFromEnv(customerName);
        const availableCustomers = listAvailableFortiManagerCustomers();

        if (!configLookup) {
          return {
            success: false,
            error: `FortiManager credentials not found for ${customerName ?? "default tenant"}.`,
            available_customers: availableCustomers,
            configuration_help:
              "Supply FortiManager credentials via environment variables, e.g.:\n" +
              "FORTIMANAGER_CUSTOMERA_URL=https://fortimanager\n" +
              "FORTIMANAGER_CUSTOMERA_API_KEY=token\n" +
              "…or use FORTIMANAGER_URL / FORTIMANAGER_API_KEY for a single tenant.",
          };
        }

        const { config: fortiManagerConfig, resolvedCustomer } = configLookup;

        const monitorService = getFortiManagerMonitorService();
        const includeAll = metrics.includes("all");
        const wantsInterfaces = includeInterfaces || includeAll || metrics.includes("interfaces");
        const wantsResources =
          includeAll || metrics.includes("cpu") || metrics.includes("memory") || metrics.includes("sessions");

        const report = await monitorService.getFirewallHealthReport(
          deviceName,
          fortiManagerConfig,
          {
            includeInterfaces: wantsInterfaces,
            includeResources: wantsResources,
            bypassCache: false,
          }
        );

        const health = sanitizeForOutput(report.health);
        const interfaces = Array.isArray(health.interfaces) ? health.interfaces : [];
        const downInterfaces = interfaces.filter((iface) => iface && iface.link === false);

        return {
          success: true,
          device_name: deviceName,
          customer: resolvedCustomer,
          summary: report.summary,
          warnings: report.warnings,
          connection: report.connection,
          health,
          interfaces: wantsInterfaces ? interfaces : undefined,
          interfaces_down: wantsInterfaces ? downInterfaces.map((iface) => iface.name) : undefined,
          queried_at: health.queried_at,
          from_cache: report.fromCache,
          cache_ttl_seconds: 60,
        };
      } catch (error: any) {
        console.error(`Error querying FortiManager for ${deviceName}:`, error);

        return {
          success: false,
          error: `Failed to query FortiManager for ${deviceName}: ${error.message}`,
          device_name: deviceName,
          troubleshooting:
            "Check: (1) FortiManager credentials configured, (2) Device name is correct, " +
            "(3) FortiManager is accessible, (4) API token has proxy permissions",
        };
      }
    },
  });
}

/**
 * Get FortiManager configuration from environment variables
 * Supports multi-customer FortiManager instances
 */
function getFortiManagerConfigFromEnv(
  requested?: string
): { config: FortiManagerConfig; resolvedCustomer: string } | null {
  const candidates = buildCandidateOrder(requested);
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeCustomer(candidate);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const config = loadFortiManagerConfig(normalized);
    if (config) {
      return {
        config,
        resolvedCustomer: normalized,
      };
    }
  }

  return null;
}

function buildCandidateOrder(requested?: string): string[] {
  const available = listAvailableFortiManagerCustomers();
  const order: string[] = [];

  if (requested) {
    order.push(requested);
  }

  // Prioritise explicit tenants before generic default
  for (const customer of available) {
    if (customer !== "default") {
      order.push(customer);
    }
  }

  // Ensure default is considered last
  order.push("default");

  return order;
}

function loadFortiManagerConfig(customer: string): FortiManagerConfig | null {
  const isDefault = customer === "default";
  const suffix = isDefault ? "" : `_${customer.toUpperCase()}`;

  const url = isDefault
    ? process.env.FORTIMANAGER_URL
    : process.env[`FORTIMANAGER${suffix}_URL`] || process.env[`FORTIMANAGER${suffix}_HOST`];

  const apiKey = isDefault
    ? process.env.FORTIMANAGER_API_KEY
    : process.env[`FORTIMANAGER${suffix}_API_KEY`];

  const username = isDefault
    ? process.env.FORTIMANAGER_USERNAME
    : process.env[`FORTIMANAGER${suffix}_USERNAME`];

  const password = isDefault
    ? process.env.FORTIMANAGER_PASSWORD
    : process.env[`FORTIMANAGER${suffix}_PASSWORD`];

  if (!url) {
    return null;
  }

  if (!apiKey && (!username || !password)) {
    return null;
  }

  return {
    url,
    apiKey: apiKey || undefined,
    username: username || undefined,
    password: password || undefined,
    customerName: customer === "default" ? undefined : customer,
  };
}

function normalizeCustomer(customer: string): string {
  if (!customer) return "default";
  const normalized = customer.toLowerCase().replace(/[^a-z0-9]/g, "_");
  return normalized === "" ? "default" : normalized;
}

export function listAvailableFortiManagerCustomers(): string[] {
  const customers = new Set<string>();
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^FORTIMANAGER_([A-Z0-9_]+)_URL$/);
    if (match) {
      customers.add(match[1].toLowerCase());
    }
  }

  if (process.env.FORTIMANAGER_URL) {
    customers.add("default");
  }

  return Array.from(customers).sort();
}

function sanitizeForOutput<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
