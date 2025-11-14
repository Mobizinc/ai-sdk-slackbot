/**
 * Connectivity Reasoning Agent
 *
 * Specialist agent that analyzes network controller data (FortiManager, VeloCloud)
 * combined with Discovery context to generate structured connectivity diagnostics.
 *
 * Architecture: Stateless, single-purpose worker that:
 * - Consumes Discovery context_pack
 * - Calls approved REST controllers for live routing/tunnel status
 * - Runs lightweight heuristics to explain connectivity gaps
 * - Returns proposed diagnostics or follow-up questions
 * - Operates in read-only mode
 *
 * @see agent-architecture.md lines 15-18
 */

import type {
  ConnectivityReasoningInput,
  ConnectivityDiagnostic,
  NetworkToolResults,
  DeviceStatus,
  CircuitBreakerState,
  DiagnosticHypothesis,
} from "./schemas";
import { ConnectivityDiagnosticSchema } from "./schemas";
import {
  applyHeuristics,
  rankHypotheses,
  computeOverallConfidence,
} from "./heuristics";
import type { DiscoveryCMDBHitSummary } from "../discovery/context-pack";

/**
 * Circuit breaker states for network tools
 * Prevents hammering degraded APIs
 */
const circuitBreakers: Record<string, CircuitBreakerState> = {};

/**
 * Circuit breaker configuration
 */
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3, // Open circuit after 3 consecutive failures
  resetTimeout: 60000, // Reset to half-open after 60 seconds
  halfOpenTimeout: 30000, // In half-open, wait 30s before trying again
};

/**
 * Get or initialize circuit breaker for a tool
 */
function getCircuitBreaker(toolName: string): CircuitBreakerState {
  if (!circuitBreakers[toolName]) {
    circuitBreakers[toolName] = {
      state: "closed",
      failures: 0,
      lastFailure: null,
      lastAttempt: null,
      nextRetryAt: null,
    };
  }
  return circuitBreakers[toolName];
}

/**
 * Check if circuit breaker allows a call
 */
function canCallTool(toolName: string): boolean {
  const breaker = getCircuitBreaker(toolName);
  const now = Date.now();

  switch (breaker.state) {
    case "closed":
      return true;

    case "open":
      // Check if we should transition to half-open
      if (breaker.nextRetryAt && now >= breaker.nextRetryAt) {
        breaker.state = "half-open";
        return true;
      }
      return false;

    case "half-open":
      // Allow one attempt
      if (!breaker.lastAttempt || now - breaker.lastAttempt >= CIRCUIT_BREAKER_CONFIG.halfOpenTimeout) {
        return true;
      }
      return false;

    default:
      return true;
  }
}

/**
 * Record tool call success
 */
function recordToolSuccess(toolName: string): void {
  const breaker = getCircuitBreaker(toolName);
  breaker.state = "closed";
  breaker.failures = 0;
  breaker.lastFailure = null;
  breaker.nextRetryAt = null;
}

/**
 * Record tool call failure
 */
function recordToolFailure(toolName: string): void {
  const breaker = getCircuitBreaker(toolName);
  const now = Date.now();

  breaker.failures++;
  breaker.lastFailure = now;
  breaker.lastAttempt = now;

  if (breaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    breaker.state = "open";
    breaker.nextRetryAt = now + CIRCUIT_BREAKER_CONFIG.resetTimeout;
    console.warn(
      `[ConnectivityReasoning] Circuit breaker opened for ${toolName} after ${breaker.failures} failures. ` +
      `Will retry at ${new Date(breaker.nextRetryAt).toISOString()}`
    );
  }
}

/**
 * Extract network devices from Discovery context pack
 */
function extractNetworkDevices(
  cmdbHits: DiscoveryCMDBHitSummary[]
): Array<{ name: string; type: string; ipAddresses: string[] }> {
  const networkDevices: Array<{ name: string; type: string; ipAddresses: string[] }> = [];

  for (const ci of cmdbHits) {
    const className = (ci.className || "").toLowerCase();

    // Identify network devices by class name
    const isNetworkDevice =
      className.includes("firewall") ||
      className.includes("router") ||
      className.includes("switch") ||
      className.includes("sdwan") ||
      className.includes("edge") ||
      className.includes("gateway");

    if (isNetworkDevice) {
      networkDevices.push({
        name: ci.name,
        type: className,
        ipAddresses: ci.ipAddresses || [],
      });
    }
  }

  return networkDevices;
}

/**
 * Map CMDB CI names to controller-specific device names
 *
 * Handles naming conventions:
 * - FortiManager: ALT-HOU-FW01, NEC-FW-HOU01
 * - VeloCloud: Edge names, Enterprise IDs
 */
function mapDeviceToControllers(
  device: { name: string; type: string },
  customerName?: string
): {
  fortimanagerDevice?: string;
  velocloudEdge?: string;
  customerName?: string;
} {
  const name = device.name;
  const type = device.type.toLowerCase();

  const result: {
    fortimanagerDevice?: string;
    velocloudEdge?: string;
    customerName?: string;
  } = {};

  // FortiManager mapping (firewalls)
  if (type.includes("firewall") || type.includes("fortinet") || type.includes("fortigate")) {
    result.fortimanagerDevice = name;
  }

  // VeloCloud mapping (SD-WAN edges)
  if (type.includes("sdwan") || type.includes("velocloud") || type.includes("edge")) {
    result.velocloudEdge = name;
  }

  // Infer customer name from device name prefix if not provided
  if (!customerName) {
    // Common patterns: ALT-*, NEC-*, EEC-*
    const prefixMatch = name.match(/^([A-Z]+)-/);
    if (prefixMatch) {
      const prefix = prefixMatch[1].toLowerCase();
      const customerMap: Record<string, string> = {
        alt: "altus",
        nec: "neighbors",
        eec: "exceptional",
        allcare: "allcare",
      };
      result.customerName = customerMap[prefix] || prefix;
    }
  } else {
    result.customerName = customerName;
  }

  return result;
}

/**
 * Build device statuses from CMDB and network tool results
 */
function buildDeviceStatuses(
  cmdbDevices: Array<{ name: string; type: string; ipAddresses: string[] }>,
  networkToolResults: NetworkToolResults
): DeviceStatus[] {
  const statuses: DeviceStatus[] = [];

  for (const device of cmdbDevices) {
    const mapping = mapDeviceToControllers(device);

    // Check FortiManager status
    if (
      mapping.fortimanagerDevice &&
      networkToolResults.fortimanager?.device_name === mapping.fortimanagerDevice
    ) {
      const fm = networkToolResults.fortimanager;
      const isConnected = fm.connection !== false;
      const hasWarnings = (fm.warnings?.length || 0) > 0;

      statuses.push({
        name: device.name,
        type: device.type.includes("firewall") ? "firewall" : "unknown",
        status: !isConnected ? "offline" : hasWarnings ? "degraded" : "healthy",
        source: "fortimanager",
        details: {
          ipAddresses: device.ipAddresses,
          metrics: fm.health,
        },
      });
    }

    // Check VeloCloud status
    if (mapping.velocloudEdge && networkToolResults.velocloud?.edges) {
      const edge = networkToolResults.velocloud.edges.find(
        (e) => e.name === mapping.velocloudEdge
      );

      if (edge) {
        const isHealthy = edge.edgeState === "CONNECTED" && edge.activationState === "ACTIVATED";
        statuses.push({
          name: device.name,
          type: "sdwan",
          status: isHealthy ? "healthy" : "degraded",
          source: "velocloud",
          details: {
            ipAddresses: device.ipAddresses,
            metrics: edge,
          },
        });
      }
    }

    // If no controller data, mark as unknown from CMDB
    if (!statuses.some((s) => s.name === device.name)) {
      statuses.push({
        name: device.name,
        type: "unknown",
        status: "unknown",
        source: "cmdb",
        details: {
          ipAddresses: device.ipAddresses,
        },
      });
    }
  }

  return statuses;
}

/**
 * Call network monitoring tools in parallel
 *
 * Integrates with FortiManager and VeloCloud services to gather live network data
 */
async function callNetworkTools(
  devices: Array<{ name: string; type: string }>,
  customerName?: string,
  options?: { skipToolCalls?: boolean; toolTimeout?: number }
): Promise<NetworkToolResults> {
  if (options?.skipToolCalls) {
    return {};
  }

  const timeout = options?.toolTimeout || 15000;
  const results: NetworkToolResults = {};

  // Import services dynamically to avoid circular dependencies
  const { getFortiManagerMonitorService } = await import("../../services/fortimanager-monitor-service");
  const { getVeloCloudService, resolveVeloCloudConfig } = await import("../../services/velocloud-service");

  // Helper to get FortiManager config
  const getFortiManagerConfig = (customer?: string) => {
    const suffix = customer && customer !== "default" ? `_${customer.toUpperCase()}` : "";
    const url = customer && customer !== "default"
      ? process.env[`FORTIMANAGER${suffix}_URL`]
      : process.env.FORTIMANAGER_URL;

    if (!url) return null;

    return {
      url,
      apiKey: customer && customer !== "default"
        ? process.env[`FORTIMANAGER${suffix}_API_KEY`]
        : process.env.FORTIMANAGER_API_KEY,
      username: customer && customer !== "default"
        ? process.env[`FORTIMANAGER${suffix}_USERNAME`]
        : process.env.FORTIMANAGER_USERNAME,
      password: customer && customer !== "default"
        ? process.env[`FORTIMANAGER${suffix}_PASSWORD`]
        : process.env.FORTIMANAGER_PASSWORD,
    };
  };

  // Call FortiManager for firewalls
  const firewallDevices = devices.filter((d) =>
    d.type.toLowerCase().includes("firewall") ||
    d.type.toLowerCase().includes("fortinet") ||
    d.type.toLowerCase().includes("fortigate")
  );

  if (firewallDevices.length > 0 && canCallTool("fortimanager")) {
    const fmConfig = getFortiManagerConfig(customerName);

    if (fmConfig && fmConfig.url) {
      try {
        const fmService = getFortiManagerMonitorService();
        // Try first firewall device
        const device = firewallDevices[0];

        console.log(`[ConnectivityReasoning] Calling FortiManager for ${device.name}...`);

        const report = await Promise.race([
          fmService.getFirewallHealthReport(device.name, fmConfig, {
            includeInterfaces: true,
            includeResources: true,
            bypassCache: false,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("FortiManager timeout")), timeout)
          ),
        ]);

        results.fortimanager = {
          success: true,
          device_name: device.name,
          customer: customerName,
          summary: report.summary,
          warnings: report.warnings,
          connection: report.connection.connected,
          health: report.health,
          interfaces: report.health.interfaces,
          interfaces_down: report.health.interfaces
            ?.filter((iface: any) => !iface.link)
            .map((iface: any) => iface.name),
          from_cache: report.fromCache,
        };

        recordToolSuccess("fortimanager");
        console.log(`[ConnectivityReasoning] FortiManager call succeeded for ${device.name}`);
      } catch (error: any) {
        console.error(`[ConnectivityReasoning] FortiManager call failed:`, error.message);
        results.fortimanager = {
          success: false,
          error: error.message,
        };
        recordToolFailure("fortimanager");
      }
    } else {
      console.warn(`[ConnectivityReasoning] FortiManager credentials not configured for ${customerName || "default"}`);
    }
  }

  // Call VeloCloud for SD-WAN edges
  const sdwanDevices = devices.filter((d) =>
    d.type.toLowerCase().includes("sdwan") ||
    d.type.toLowerCase().includes("velocloud") ||
    d.type.toLowerCase().includes("edge")
  );

  if (sdwanDevices.length > 0 && canCallTool("velocloud")) {
    const vcConfig = resolveVeloCloudConfig(customerName);

    if (vcConfig) {
      try {
        const vcService = getVeloCloudService();

        console.log(`[ConnectivityReasoning] Calling VeloCloud for edges...`);

        // Get edges
        const edges = await Promise.race([
          vcService.listEdges(vcConfig.config),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("VeloCloud timeout")), timeout)
          ),
        ]);

        // Get links for first edge
        let links: any[] = [];
        if (edges && edges.length > 0) {
          const edge = edges[0];
          if (edge.id) {
            try {
              links = await Promise.race([
                vcService.getEdgeLinkStatus(vcConfig.config, { edgeId: edge.id }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("VeloCloud links timeout")), timeout)
                ),
              ]);
            } catch (linkError: any) {
              console.warn(`[ConnectivityReasoning] Failed to get VeloCloud links: ${linkError.message}`);
            }
          }
        }

        // Map to expected format
        const formattedEdges = edges.map((e: any) => ({
          id: e.id || 0,
          name: e.name || "",
          activationState: e.activationState || "UNKNOWN",
          edgeState: e.edgeState || "UNKNOWN",
        }));

        const formattedLinks = links.map((link: any) => ({
          displayName: link.name || "",
          state: link.linkState || "UNKNOWN",
          vpnState: link.linkState || "UNKNOWN",
          linkQuality: {
            jitter: link.jitterMs,
            latency: link.latencyMs,
            loss: link.lossPct,
          },
        }));

        results.velocloud = {
          success: true,
          edges: formattedEdges,
          links: formattedLinks,
        };

        recordToolSuccess("velocloud");
        console.log(`[ConnectivityReasoning] VeloCloud call succeeded`);
      } catch (error: any) {
        console.error(`[ConnectivityReasoning] VeloCloud call failed:`, error.message);
        results.velocloud = {
          success: false,
          error: error.message,
        };
        recordToolFailure("velocloud");
      }
    } else {
      console.warn(`[ConnectivityReasoning] VeloCloud credentials not configured for ${customerName || "default"}`);
    }
  }

  return results;
}

/**
 * Run the connectivity reasoning agent
 *
 * @param input - Context pack and optional network tool results
 * @returns Structured connectivity diagnostics
 */
export async function runConnectivityReasoningAgent(
  input: ConnectivityReasoningInput
): Promise<ConnectivityDiagnostic> {
  const startTime = Date.now();
  const toolsCalled: string[] = [];
  const heuristicsApplied: string[] = [];

  try {
    // Extract network devices from Discovery context pack
    const cmdbHits = input.contextPack.cmdbHits?.items || [];
    const networkDevices = extractNetworkDevices(cmdbHits);

    if (networkDevices.length === 0) {
      // No network devices found - return low-confidence diagnostic
      return {
        hypotheses: [],
        summary: "No network devices identified in CMDB data. Unable to perform connectivity diagnostics.",
        overallConfidence: "low",
        devicesAnalyzed: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          toolsCalled: [],
          heuristicsApplied: [],
          contextPackVersion: input.contextPack.schemaVersion,
        },
      };
    }

    // Get or call network tools
    let networkToolResults: NetworkToolResults;

    if (input.networkToolResults) {
      // Use provided results
      networkToolResults = input.networkToolResults;
    } else {
      // Call tools (if not skipped and circuit breakers allow)
      const canCallFM = canCallTool("fortimanager");
      const canCallVC = canCallTool("velocloud");

      if (!canCallFM) {
        console.warn("[ConnectivityReasoning] FortiManager circuit breaker is open, skipping tool call");
      }
      if (!canCallVC) {
        console.warn("[ConnectivityReasoning] VeloCloud circuit breaker is open, skipping tool call");
      }

      networkToolResults = await callNetworkTools(
        networkDevices,
        input.contextPack.metadata.companyName,
        input.options
      );

      // Record tool calls for metadata
      if (networkToolResults.fortimanager) {
        toolsCalled.push("fortimanager");
        if (networkToolResults.fortimanager.success) {
          recordToolSuccess("fortimanager");
        } else {
          recordToolFailure("fortimanager");
        }
      }

      if (networkToolResults.velocloud) {
        toolsCalled.push("velocloud");
        if (networkToolResults.velocloud.success) {
          recordToolSuccess("velocloud");
        } else {
          recordToolFailure("velocloud");
        }
      }
    }

    // Build device statuses
    const deviceStatuses = buildDeviceStatuses(networkDevices, networkToolResults);

    // Apply heuristics
    const heuristicResults = applyHeuristics(
      input.contextPack,
      networkToolResults,
      deviceStatuses
    );

    heuristicsApplied.push(...heuristicResults.map((r) => r.ruleName));

    // Rank hypotheses by confidence
    const hypotheses = rankHypotheses(heuristicResults);

    // Compute overall confidence
    const overallConfidence = computeOverallConfidence(hypotheses);

    // Generate summary
    const summary = generateSummary(hypotheses, deviceStatuses);

    // Build diagnostic output
    const diagnostic: ConnectivityDiagnostic = {
      hypotheses,
      summary,
      overallConfidence,
      devicesAnalyzed: deviceStatuses.map((d) => ({
        name: d.name,
        type: d.type,
        status: d.status,
        source: d.source,
      })),
      dataFreshness: {
        fortimanager: networkToolResults.fortimanager
          ? {
              usedCache: networkToolResults.fortimanager.from_cache || false,
              stale: false,
            }
          : undefined,
        velocloud: networkToolResults.velocloud
          ? {
              usedCache: false,
              stale: false,
            }
          : undefined,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        toolsCalled,
        heuristicsApplied,
        contextPackVersion: input.contextPack.schemaVersion,
      },
    };

    // Validate against schema
    const validated = ConnectivityDiagnosticSchema.parse(diagnostic);

    const duration = Date.now() - startTime;
    console.log(
      `[ConnectivityReasoning] Diagnostic complete in ${duration}ms. ` +
      `${hypotheses.length} hypotheses, overall confidence: ${overallConfidence}`
    );

    return validated;
  } catch (error: any) {
    console.error("[ConnectivityReasoning] Agent error:", error);

    // Return fallback diagnostic
    return {
      hypotheses: [],
      summary: `Unable to complete connectivity diagnostics: ${error.message}`,
      overallConfidence: "low",
      metadata: {
        generatedAt: new Date().toISOString(),
        toolsCalled,
        heuristicsApplied,
        contextPackVersion: input.contextPack.schemaVersion,
      },
    };
  }
}

/**
 * Generate human-readable summary from hypotheses
 */
function generateSummary(
  hypotheses: DiagnosticHypothesis[],
  deviceStatuses: DeviceStatus[]
): string {
  if (hypotheses.length === 0) {
    const healthyDevices = deviceStatuses.filter((d) => d.status === "healthy").length;
    const totalDevices = deviceStatuses.length;

    if (healthyDevices === totalDevices) {
      return `All ${totalDevices} network device(s) appear healthy. No connectivity issues detected.`;
    }

    return "No specific connectivity issues identified. Manual investigation may be required.";
  }

  const topHypothesis = hypotheses[0];
  const additionalCount = hypotheses.length - 1;

  let summary = topHypothesis.hypothesis;

  if (additionalCount > 0) {
    summary += ` (${additionalCount} additional ${additionalCount === 1 ? "hypothesis" : "hypotheses"} identified)`;
  }

  return summary;
}

/**
 * Export schemas and types
 */
export type {
  ConnectivityReasoningInput,
  ConnectivityDiagnostic,
  DiagnosticHypothesis,
  NetworkToolResults,
  DeviceStatus,
} from "./schemas";

export { ConnectivityDiagnosticSchema, DiagnosticHypothesisSchema } from "./schemas";
