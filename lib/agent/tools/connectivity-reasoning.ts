/**
 * Connectivity Reasoning Tool
 *
 * Exposes the Connectivity Reasoning Agent as an Anthropic tool that can be called
 * by the conversational agent to diagnose network connectivity issues.
 *
 * This tool wraps the runConnectivityReasoningAgent function and integrates with
 * the existing tool ecosystem (FortiManager, VeloCloud) to provide comprehensive
 * connectivity diagnostics.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { runConnectivityReasoningAgent } from "../connectivity-reasoning";
import type { ConnectivityReasoningInput } from "../connectivity-reasoning";
import { generateDiscoveryContextPack } from "../discovery/context-pack";
import { getFortiManagerMonitorService } from "../../services/fortimanager-monitor-service";
import {
  getVeloCloudService,
  resolveVeloCloudConfig,
} from "../../services/velocloud-service";

/**
 * Input schema for the connectivity reasoning tool
 */
const connectivityReasoningInputSchema = z.object({
  caseNumber: z
    .string()
    .describe("Case or incident number to analyze (e.g., SCS0001234, INC0001234)"),

  channelId: z
    .string()
    .optional()
    .describe("Optional Slack channel ID for additional context"),

  threadTs: z
    .string()
    .optional()
    .describe("Optional Slack thread timestamp for additional context"),

  companyName: z
    .string()
    .optional()
    .describe(
      "Optional company/customer name to filter network controller credentials (e.g., 'altus', 'neighbors')"
    ),

  deviceName: z
    .string()
    .optional()
    .describe(
      "Optional specific device name to analyze (e.g., 'ALT-HOU-FW01'). If omitted, will analyze all network devices found in CMDB."
    ),

  skipToolCalls: z
    .boolean()
    .optional()
    .describe(
      "Set to true to skip calling FortiManager/VeloCloud tools and rely only on CMDB/history. Useful when network APIs are unavailable."
    ),
});

export type ConnectivityReasoningToolInput = z.infer<typeof connectivityReasoningInputSchema>;

/**
 * Create the connectivity reasoning tool
 */
export function createConnectivityReasoningTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "diagnoseConnectivity",
    description:
      "Use when investigating network connectivity issues, packet loss, high latency, firewall problems, SD-WAN link degradation, or device offline scenarios. " +
      "Combines CMDB data, case history, FortiManager firewall metrics, and VeloCloud SD-WAN link quality to generate structured diagnostic hypotheses with confidence levels. " +
      "Returns actionable next steps, follow-up questions, and references to similar cases or KB articles. " +
      "Best used when you have a case number and suspect network infrastructure issues.",
    inputSchema: connectivityReasoningInputSchema,
    execute: async ({
      caseNumber,
      channelId,
      threadTs,
      companyName,
      deviceName,
      skipToolCalls = false,
    }: ConnectivityReasoningToolInput) => {
      try {
        updateStatus?.(`Generating discovery context pack for ${caseNumber}...`);

        // Generate Discovery context pack
        const contextPack = await generateDiscoveryContextPack({
          caseNumbers: [caseNumber],
          channelId,
          threadTs,
          companyName,
        });

        if (contextPack.cmdbHits?.total === 0 && !deviceName) {
          return {
            success: false,
            error: "No network devices found in CMDB for this case. Cannot perform connectivity diagnostics.",
            suggestion:
              "Try searching CMDB manually or provide a specific deviceName to analyze.",
          };
        }

        updateStatus?.(
          `Calling network monitoring tools for connectivity diagnostics...`
        );

        // Prepare input for connectivity reasoning agent
        const agentInput: ConnectivityReasoningInput = {
          contextPack,
          caseMetadata: {
            caseNumber,
          },
          options: {
            skipToolCalls,
            toolTimeout: 15000, // 15 second timeout per tool
          },
        };

        // If specific device requested, call tools directly
        if (deviceName) {
          try {
            const networkToolResults: ConnectivityReasoningInput["networkToolResults"] = {};

            // Try FortiManager if device looks like a firewall
            if (!skipToolCalls) {
              try {
                const fortiManagerService = getFortiManagerMonitorService();
                // Note: This is a simplified example - real implementation would need proper config resolution
                // and error handling similar to the fortimanager-monitor tool

                updateStatus?.(`Querying FortiManager for ${deviceName}...`);

                // For now, skip actual tool call and let agent handle it
                // TODO: Integrate properly with FortiManager tool executor
              } catch (fmError: any) {
                console.warn(
                  `[ConnectivityReasoning] FortiManager query failed: ${fmError.message}`
                );
              }

              try {
                // Try VeloCloud if device looks like SD-WAN edge
                const velocloudConfig = resolveVeloCloudConfig(companyName);
                if (velocloudConfig) {
                  updateStatus?.(`Querying VeloCloud for ${deviceName}...`);

                  // For now, skip actual tool call and let agent handle it
                  // TODO: Integrate properly with VeloCloud tool executor
                }
              } catch (vcError: any) {
                console.warn(
                  `[ConnectivityReasoning] VeloCloud query failed: ${vcError.message}`
                );
              }
            }

            agentInput.networkToolResults = networkToolResults;
          } catch (toolError: any) {
            console.error(
              `[ConnectivityReasoning] Tool calls failed: ${toolError.message}`
            );
            // Continue with agent execution - it will handle missing tool data
          }
        }

        // Run the connectivity reasoning agent
        updateStatus?.(`Analyzing connectivity data and generating diagnostics...`);

        const diagnostic = await runConnectivityReasoningAgent(agentInput);

        // Format response for the conversational agent
        const response: any = {
          success: true,
          caseNumber,
          summary: diagnostic.summary,
          overallConfidence: diagnostic.overallConfidence,
          hypothesesCount: diagnostic.hypotheses.length,
          devicesAnalyzed: diagnostic.devicesAnalyzed?.length || 0,
        };

        // Add top hypotheses (limit to top 3)
        if (diagnostic.hypotheses.length > 0) {
          response.topHypotheses = diagnostic.hypotheses.slice(0, 3).map((h) => ({
            hypothesis: h.hypothesis,
            confidence: h.confidence,
            evidence: h.evidence,
            suggestedActions: h.suggestedActions,
            followUpQuestions: h.followUpQuestions || [],
            category: h.category,
          }));
        }

        // Add device status summary
        if (diagnostic.devicesAnalyzed && diagnostic.devicesAnalyzed.length > 0) {
          response.devices = diagnostic.devicesAnalyzed.map((d) => ({
            name: d.name,
            type: d.type,
            status: d.status,
            source: d.source,
          }));
        }

        // Add metadata
        response.metadata = {
          generatedAt: diagnostic.metadata.generatedAt,
          toolsCalled: diagnostic.metadata.toolsCalled,
          heuristicsApplied: diagnostic.metadata.heuristicsApplied,
          usedCache: diagnostic.dataFreshness?.fortimanager?.usedCache ||
            diagnostic.dataFreshness?.velocloud?.usedCache ||
            false,
        };

        // Add warnings if data is stale
        if (
          diagnostic.dataFreshness?.fortimanager?.stale ||
          diagnostic.dataFreshness?.velocloud?.stale
        ) {
          response.warnings = ["Some network data is stale. Results may not reflect current state."];
        }

        updateStatus?.(`Connectivity diagnostics complete for ${caseNumber}`);

        return response;
      } catch (error: any) {
        console.error(
          `[ConnectivityReasoning] Tool execution error for ${caseNumber}:`,
          error
        );

        return {
          success: false,
          error: `Failed to generate connectivity diagnostics: ${error.message}`,
          caseNumber,
          troubleshooting:
            "Check: (1) Case number exists, (2) CMDB has network device records, " +
            "(3) Network controller credentials configured, (4) APIs are accessible",
        };
      }
    },
  });
}
