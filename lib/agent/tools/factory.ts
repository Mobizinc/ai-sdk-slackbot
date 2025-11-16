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
import { createServiceNowOrchestrationTool } from "./servicenow-orchestration";
import { createCaseAggregationTool } from "./case-aggregation";
import { createCaseSearchTool } from "./case-search";
import { createFortiManagerMonitorTool } from "./fortimanager-monitor";
import { createVeloCloudTool } from "./velocloud";
import { createConnectivityReasoningTool } from "./connectivity-reasoning";
import { createFeedbackCollectionTool } from "./feedback-collection";
import { createDescribeCapabilitiesTool } from "./describe-capabilities";
import { createServiceNowCatalogWorkflowTool } from "./servicenow-catalog-workflow";
import type { AgentToolFactoryParams } from "./shared";

// Import new modular ServiceNow tools (Phase 1)
import { createGetIncidentTool } from "./servicenow/incident/get-incident.tool";
import { createGetCaseTool } from "./servicenow/case/get-case.tool";
import { createGetCaseJournalTool } from "./servicenow/case/get-case-journal.tool";
import { createSearchKnowledgeTool } from "./servicenow/knowledge/search-knowledge.tool";
import { createSearchConfigurationItemsTool } from "./servicenow/cmdb/search-configuration-items.tool";

// Import new modular ServiceNow tools (Phase 2)
import { createGetCIRelationshipsTool } from "./servicenow/cmdb/get-ci-relationships.tool";
import { createGetRequestTool } from "./servicenow/catalog/get-request.tool";
import { createGetRequestedItemTool } from "./servicenow/catalog/get-requested-item.tool";
import { createGetCatalogTaskTool } from "./servicenow/catalog/get-catalog-task.tool";
import { createGetProjectTool } from "./servicenow/spm/get-project.tool";
import { createSearchProjectsTool } from "./servicenow/spm/search-projects.tool";
import { createGetProjectEpicsTool } from "./servicenow/spm/get-project-epics.tool";
import { createGetProjectStoriesTool } from "./servicenow/spm/get-project-stories.tool";

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
export type { ConnectivityReasoningToolInput } from "./connectivity-reasoning";
export type { FeedbackCollectionInput } from "./feedback-collection";
export type { DescribeCapabilitiesInput } from "./describe-capabilities";
export type { ClassificationAgentInput } from "./classification-agent";
export type { ServiceNowOrchestrationToolInput } from "./servicenow-orchestration";
export type { CreateCmdbRecordInput } from "./cmdb";
export type { CatalogWorkflowToolInput } from "./servicenow-catalog-workflow";

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
  const tools = {
    getWeather: createWeatherTool(params),
    searchWeb: createWebSearchTool(params),

    // ===== ServiceNow Modular Tools (Phase 1 & 2) =====
    // Single-purpose tools for improved LLM tool selection

    // Incident domain
    getIncident: createGetIncidentTool(params),

    // Case domain
    getCase: createGetCaseTool(params),
    getCaseJournal: createGetCaseJournalTool(params),

    // CMDB domain
    searchConfigurationItems: createSearchConfigurationItemsTool(params),
    getCIRelationships: createGetCIRelationshipsTool(params), // Phase 2

    // Knowledge domain
    searchKnowledge: createSearchKnowledgeTool(params),

    // Catalog domain (Phase 2)
    getRequest: createGetRequestTool(params),
    getRequestedItem: createGetRequestedItemTool(params),
    getCatalogTask: createGetCatalogTaskTool(params),

    // SPM domain (Phase 2)
    getProject: createGetProjectTool(params),
    searchProjects: createSearchProjectsTool(params),
    getProjectEpics: createGetProjectEpicsTool(params),
    getProjectStories: createGetProjectStoriesTool(params),

    // Legacy monolithic ServiceNow tool (deprecated, will be removed in Phase 4)
    serviceNow: createServiceNowTool(params),

    // Other tools
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
    orchestrateServiceNowCase: createServiceNowOrchestrationTool(params),
    caseAggregation: createCaseAggregationTool(params),
    getFirewallStatus: createFortiManagerMonitorTool(params),
    queryVelocloud: createVeloCloudTool(params),
    diagnoseConnectivity: createConnectivityReasoningTool(params),
    collectFeatureFeedback: createFeedbackCollectionTool(params),
    getServiceNowCatalogWorkflow: createServiceNowCatalogWorkflowTool(params),
  };

  const filteredTools = filterToolsByAllowList(tools, params.allowedTools);

  const describeCapabilities = createDescribeCapabilitiesTool(
    params,
    () => filteredTools as any
  );

  return {
    describeCapabilities,
    ...filteredTools,
  };
}

function filterToolsByAllowList(
  tools: Record<string, any>,
  allowList?: string[]
): Record<string, any> {
  if (!allowList || allowList.length === 0) {
    return tools;
  }

  const allowed = new Set(allowList);
  const entries = Object.entries(tools).filter(([name]) => allowed.has(name));

  if (entries.length === 0) {
    return tools;
  }

  return Object.fromEntries(entries);
}

/**
 * @deprecated Use createAgentTools instead. This alias exists for backward compatibility.
 */
export const createLegacyAgentTools = createAgentTools;
