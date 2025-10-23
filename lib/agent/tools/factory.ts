/**
 * Agent Tools Factory
 *
 * Re-exports individual tool modules and provides unified factory function.
 * This file serves as the public API for the legacy tool system.
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
import { createMicrosoftLearnTool } from "./microsoft-learn";
import { createTriageTool } from "./triage";

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

// Re-export shared types
export type { AgentToolFactoryParams } from "./shared";

/**
 * Creates all agent tools for the legacy agent implementation.
 *
 * This function combines all individual tool modules into a single registry
 * that maintains backward compatibility with the legacy tool system.
 *
 * @param params - Factory parameters including messages, case numbers, and callbacks
 * @returns Record of all available tools keyed by name
 */
export function createLegacyAgentTools(params: AgentToolFactoryParams) {
  return {
    getWeather: createWeatherTool(params),
    searchWeb: createWebSearchTool(params),
    serviceNow: createServiceNowTool(params),
    searchSimilarCases: createSearchTool(params),
    generateKBArticle: createKnowledgeBaseTool(params),
    proposeContextUpdate: createContextUpdateTool(params),
    fetchCurrentIssues: createCurrentIssuesTool(params),
    microsoftLearnSearch: createMicrosoftLearnTool(params),
    triageCase: createTriageTool(params),
  };
}
