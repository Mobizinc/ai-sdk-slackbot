/**
 * Agent Tools Factory
 *
 * Re-exports individual tool modules and provides unified factory function.
 * This file serves as the public API for the modular tool system.
 *
 * All tool implementations have been extracted to dedicated modules:
 * - weather.ts, web-search.ts, service-now.ts, search.ts
 * - knowledge-base.ts, context-update.ts, current-issues.ts
 * - microsoft-learn.ts, triage.ts
 */

// Import tool creators from dedicated modules
import { createWeatherTool } from "./weather";
import { createWebSearchTool } from "./web-search";
import { createServiceNowTool } from "./service-now";
import { createSearchTool } from "./search";
import { createKnowledgeBaseTool } from "./knowledge-base";
import { createContextUpdateTool } from "./context-update";
import { createCurrentIssuesTool } from "./current-issues";
import { createCmdbTool, createConfigurationItemTool } from "./cmdb";
import { createMicrosoftLearnTool } from "./microsoft-learn";
import { createTriageTool } from "./triage";
import { createClassificationAgentTool } from "./classification-agent";
import { createCaseAggregationTool } from "./case-aggregation";
import { createCaseSearchTool } from "./case-search";
import { createFortiManagerMonitorTool } from "./fortimanager-monitor";
import { createVeloCloudTool } from "./velocloud";
import { createFeedbackCollectionTool } from "./feedback-collection";
import { createDescribeCapabilitiesTool } from "./describe-capabilities";
import type { AgentToolFactoryParams } from "./shared";

// Re-export types from individual tool modules for backward compatibility
export type { WeatherToolInput } from "./weather";
export type { SearchWebToolInput } from "./web-search";
export type { ServiceNowToolInput } from "./service-now";
export type { SearchSimilarCasesInput } from "./search";
export type { GenerateKBArticleInput } from "./knowledge-base";
export type { ProposeContextUpdateInput } from "./context-update";
export type { FetchCurrentIssuesInput } from "./current-issues";
export type { MicrosoftLearnSearchInput } from "./microsoft-learn";
export type { TriageCaseInput } from "./triage";
export type { CaseAggregationInput } from "./case-aggregation";
export type { CaseSearchInput } from "./case-search";
export type { FortiManagerMonitorInput } from "./fortimanager-monitor";
export type { VeloCloudToolInput } from "./velocloud";
export type { FeedbackCollectionInput } from "./feedback-collection";
export type { DescribeCapabilitiesInput } from "./describe-capabilities";
export type { ClassificationAgentInput } from "./classification-agent";
export type { CreateCmdbRecordInput } from "./cmdb";

// Re-export shared types
export type { AgentToolFactoryParams } from "./shared";

/**
 * Creates all agent tools for the Anthropic orchestrator.
 *
 * This function combines all individual tool modules into a single registry
 * that provides the complete tool set for the agent.
 *
 * @param params - Factory parameters including messages, case numbers, and callbacks
 * @returns Record of all available tools keyed by name
 */
export function createAgentTools(params: AgentToolFactoryParams) {
  // Create all tools as a single object
  // describeCapabilities gets access to all tools via closure for true introspection
  const tools = {
    getWeather: createWeatherTool(params),
    searchWeb: createWebSearchTool(params),
    serviceNow: createServiceNowTool(params),
    searchSimilarCases: createSearchTool(params),
    searchCases: createCaseSearchTool(params),
    generateKBArticle: createKnowledgeBaseTool(params),
    proposeContextUpdate: createContextUpdateTool(params),
    fetchCurrentIssues: createCurrentIssuesTool(params),
    microsoftLearnSearch: createMicrosoftLearnTool(params),
    searchCMDB: createCmdbTool(params),
    createConfigurationItem: createConfigurationItemTool(params),
    triageCase: createTriageTool(params),
    runClassificationAgent: createClassificationAgentTool(params),
    caseAggregation: createCaseAggregationTool(params),
    getFirewallStatus: createFortiManagerMonitorTool(params),
    queryVelocloud: createVeloCloudTool(params),
    collectFeatureFeedback: createFeedbackCollectionTool(params),
  };

  // Create describeCapabilities with access to all other tools for runtime introspection
  // This enables true dynamic discovery without hardcoded metadata
  const describeCapabilities = createDescribeCapabilitiesTool(
    params,
    () => tools as any // Return all tools for introspection
  );

  // Return complete tool set with describeCapabilities at the front for priority
  return {
    describeCapabilities,
    ...tools,
  };
}

/**
 * @deprecated Use createAgentTools instead. This alias exists for backward compatibility.
 */
export const createLegacyAgentTools = createAgentTools;
