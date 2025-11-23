// Configuration helpers for consolidated config access
import { getConfigValue } from "./loader";

export function getServiceNowConfig() {
  const environment = getConfigValue("servicenowEnvironment") as string;
  const environments = JSON.parse(getConfigValue("servicenowEnvironments") as string);

  if (!environments[environment]) {
    throw new Error(`ServiceNow environment '${environment}' not configured`);
  }

  return {
    ...environments[environment],
    environment,
    caseJournalName: getConfigValue("servicenowCaseJournalName"),
    apiToken: getConfigValue("servicenowApiToken"),
    webhookSecret: getConfigValue("servicenowWebhookSecret"),
    cloneTargetInstance: environments[environment].cloneTargetInstance || "mobizuat",
    cloneSourceInstance: environments[environment].cloneSourceInstance || "mobizprod"
  };
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
