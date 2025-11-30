// Configuration helpers for consolidated config access
import { getConfigValue } from "./loader";

export function getServiceNowConfig() {
  const environment = getConfigValue("servicenowEnvironment") as string;
  const environmentsJson = getConfigValue("servicenowEnvironments") as string;

  let environments: Record<string, any> = {};
  try {
    environments = JSON.parse(environmentsJson);
  } catch (e) {
    console.warn("[Config] Failed to parse servicenowEnvironments JSON, using fallback");
  }

  const envConfig = environments[environment] || {};

  // Backward compatibility: fall back to direct env vars if environment config is empty
  const instanceUrl = envConfig.instanceUrl || process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL || "";
  const username = envConfig.username || process.env.SERVICENOW_USERNAME || "";
  const password = envConfig.password || process.env.SERVICENOW_PASSWORD || "";
  const apiToken = getConfigValue("servicenowApiToken") as string || process.env.SERVICENOW_API_TOKEN || "";
  // Prefer explicit env override for table in case the JSON default is set to a different table
  const caseTable = (process.env.SERVICENOW_CASE_TABLE || envConfig.caseTable || "x_mobit_serv_case_service_case").trim();

  return {
    ...envConfig,
    environment,
    instanceUrl,
    username,
    password,
    apiToken,
    caseTable,
    caseJournalName: getConfigValue("servicenowCaseJournalName"),
    webhookSecret: getConfigValue("servicenowWebhookSecret"),
    cloneTargetInstance: envConfig.cloneTargetInstance || "mobizuat",
    cloneSourceInstance: envConfig.cloneSourceInstance || "mobizprod"
  };
}

/**
 * Check if ServiceNow is properly configured with credentials
 * Used for health checks and feature availability
 */
export function isServiceNowConfigured(): boolean {
  const config = getServiceNowConfig();
  const hasInstanceUrl = Boolean(config.instanceUrl);
  const hasAuth = Boolean(config.apiToken || (config.username && config.password));
  return hasInstanceUrl && hasAuth;
}

export function getLlmTimeout(operation: "general" | "classification" | "kbGeneration" | "escalation"): number {
  const timeouts = JSON.parse(getConfigValue("llmTimeouts") as string);
  return timeouts[operation] || timeouts.general;
}

export function getDiscoveryFeatures() {
  return JSON.parse(getConfigValue("discoveryFeatures") as string);
}

export function getWebexConfig() {
  return JSON.parse(getConfigValue("webexConfig") as string);
}

export function getAgentProfile(profile: "assistant" | "supervisor" | "escalation") {
  const profiles = JSON.parse(getConfigValue("agentProfiles") as string);
  return profiles[profile];
}

// Backward compatibility helpers
export function getAssistantMinDescriptionLength(): number {
  return getAgentProfile("assistant").minDescriptionLength;
}

export function getAssistantSimilarCasesTopK(): number {
  return getAgentProfile("assistant").similarCasesTopK;
}

export function getAgentMaxToolIterations(): number {
  return getAgentProfile("assistant").maxToolIterations;
}

export function getAssistantActiveStates(): string[] {
  return getAgentProfile("assistant").activeStates;
}

export function getProactiveTroubleshootingEnabled(): boolean {
  return getAgentProfile("assistant").proactiveTroubleshooting;
}

export function getMaxClarifyingQuestions(): number {
  return getAgentProfile("assistant").maxClarifyingQuestions;
}

export function getEnableMultimodalToolResults(): boolean {
  return getAgentProfile("assistant").enableMultimodalToolResults;
}

export function getMaxImageAttachmentsPerTool(): number {
  return getAgentProfile("assistant").maxImageAttachmentsPerTool;
}

export function getMaxImageSizeBytes(): number {
  return getAgentProfile("assistant").maxImageSizeBytes;
}

export function getSupervisorEnabled(): boolean {
  return getAgentProfile("supervisor").enabled;
}

export function getSupervisorShadowMode(): boolean {
  return getAgentProfile("supervisor").shadowMode;
}

export function getSupervisorDuplicateWindowMinutes(): number {
  return getAgentProfile("supervisor").duplicateWindowMinutes;
}

export function getSupervisorAlertChannel(): string {
  return getAgentProfile("supervisor").alertChannel;
}

export function getSupervisorLlmReviewModel(): string {
  return getAgentProfile("supervisor").llmReviewModel;
}

export function getDiscoveryContextPackEnabled(): boolean {
  return getDiscoveryFeatures().contextPackEnabled;
}

export function getPolicySignalsMaintenanceWindowEnabled(): boolean {
  return getDiscoveryFeatures().maintenanceWindowDetection;
}

export function getPolicySignalsSLACheckEnabled(): boolean {
  return getDiscoveryFeatures().slaChecks;
}

export function getPolicySignalsHighRiskCustomerEnabled(): boolean {
  return getDiscoveryFeatures().highRiskCustomers;
}

export function getPolicySignalsAfterHoursEnabled(): boolean {
  return getDiscoveryFeatures().afterHours;
}

export function getDiscoveryContextCachingEnabled(): boolean {
  return getDiscoveryFeatures().contextCachingEnabled;
}

export function getEscalationNotifyAssignedEngineer(): boolean {
  return getAgentProfile("escalation").notifyAssignedEngineer;
}
