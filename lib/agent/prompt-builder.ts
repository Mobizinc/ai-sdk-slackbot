/**
 * Prompt Builder (Phase 3C Complete)
 *
 * Assembles system prompts and conversation context for the agent by loading
 * base prompts, enriching with business context, and preparing message history.
 */

import type { CoreMessage } from "./types";
import type { ContextLoaderResult } from "./context-loader";
import { getSystemPrompt } from "../system-prompt";
import { getBusinessContextService } from "../services/business-context-service";
import type { DiscoveryContextPack } from "./discovery/context-pack";
import { getConfigValue } from "../config";

export interface PromptBuilderInput {
  context: ContextLoaderResult;
  requestTimestamp?: string;
}

export interface PromptBuilderResult {
  systemPrompt: string;
  conversation: CoreMessage[];
}

export async function buildPrompt(input: PromptBuilderInput): Promise<PromptBuilderResult> {
  const context = input.context;
  const requestDate = input.requestTimestamp ?? new Date().toISOString().split("T")[0];

  const basePrompt = await getSystemPrompt(requestDate);
  const businessContextService = getBusinessContextService();

  const companyName = (context.metadata.businessContext as { entityName?: string } | undefined)
    ?.entityName ?? (context.metadata.companyName as string | undefined);

  let enhancedPrompt = await businessContextService.enhancePromptWithContext(
    basePrompt,
    companyName,
    (context.metadata.caseContext as any)?.channelTopic,
    (context.metadata.caseContext as any)?.channelPurpose,
    (context.metadata.similarCases as any[]) ?? [],
  );

  // Append discovery context pack if available
  if (getConfigValue("discoveryContextPackEnabled")) {
    const discoveryPack = context.metadata.discovery as DiscoveryContextPack | undefined;
    if (discoveryPack) {
      const discoverySection = formatDiscoveryContextForPrompt(discoveryPack);
      if (discoverySection) {
        enhancedPrompt = `${enhancedPrompt}\n\n${discoverySection}`;
      }
    }
  }

  return {
    systemPrompt: enhancedPrompt,
    conversation: context.messages,
  };
}

/**
 * Format discovery context pack for inclusion in system prompt
 */
function formatDiscoveryContextForPrompt(pack: DiscoveryContextPack): string | null {
  const sections: string[] = [];

  sections.push("## Discovery Context");
  sections.push(
    `*Generated at ${new Date(pack.generatedAt).toLocaleString()}*`
  );

  // CMDB/CI Hits
  if (pack.cmdbHits && pack.cmdbHits.total > 0) {
    sections.push("\n### Configuration Items Detected");
    for (const ci of pack.cmdbHits.items.slice(0, 3)) {
      const details: string[] = [ci.name];
      if (ci.ipAddresses && ci.ipAddresses.length > 0) {
        details.push(`IP: ${ci.ipAddresses.join(", ")}`);
      }
      if (ci.environment) {
        details.push(`Env: ${ci.environment}`);
      }
      if (ci.status) {
        details.push(`Status: ${ci.status}`);
      }
      sections.push(`- **${details[0]}** (${ci.matchReason})`);
      if (details.length > 1) {
        sections.push(`  ${details.slice(1).join(" | ")}`);
      }
    }
  }

  // Policy Alerts
  if (pack.policyAlerts && pack.policyAlerts.length > 0) {
    sections.push("\n### Policy Alerts");
    for (const alert of pack.policyAlerts.slice(0, 5)) {
      const icon =
        alert.severity === "critical"
          ? "🔴"
          : alert.severity === "warning"
          ? "⚠️"
          : "ℹ️";
      sections.push(`- ${icon} **${alert.type}**: ${alert.message}`);
    }
  }

  // Similar Cases (already included in business context, so optional here)
  if (pack.similarCases && pack.similarCases.total > 0) {
    sections.push(
      `\n*Note: ${pack.similarCases.total} similar case(s) found and included in context*`
    );
  }

  return sections.length > 2 ? sections.join("\n") : null;
}
