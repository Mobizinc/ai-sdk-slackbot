interface NumericOption {
  value: number;
  defaultValue: number;
  raw: string | undefined;
  envKey: string;
}

function parseNumberOption({ value, defaultValue, raw, envKey }: NumericOption): number {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  if (raw !== undefined) {
    console.warn(
      `[Config] Ignoring invalid value for ${envKey}: ${raw}. Using default ${defaultValue}.`,
    );
  }

  return defaultValue;
}

function getNumberEnv(envKey: string, defaultValue: number): number {
  const raw = process.env[envKey];
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);
  return parseNumberOption({ value: parsed, defaultValue, raw, envKey });
}

function getStringArrayEnv(envKey: string, defaultValue: string[]): string[] {
  const raw = process.env[envKey];
  if (!raw || raw.trim() === "") {
    return defaultValue;
  }

  // Parse comma-separated values
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function getBooleanEnv(envKey: string, defaultValue: boolean): boolean {
  const raw = process.env[envKey];
  if (!raw) {
    return defaultValue;
  }
  return raw.toLowerCase() === "true" || raw === "1";
}

export const config = {
  kbGatheringTimeoutHours: getNumberEnv("KB_GATHERING_TIMEOUT_HOURS", 24),
  kbGatheringMaxAttempts: getNumberEnv("KB_GATHERING_MAX_ATTEMPTS", 5),
  assistantMinDescriptionLength: getNumberEnv("ASSISTANT_MIN_DESCRIPTION_LENGTH", 10),
  assistantSimilarCasesTopK: getNumberEnv("ASSISTANT_SIMILAR_CASES_TOP_K", 3),
  kbSimilarCasesTopK: getNumberEnv("KB_SIMILAR_CASES_TOP_K", 3),
  // Only post intelligent assistance for cases in these states
  // Default: New, In Progress, On Hold, Pending
  // Excludes: Closed, Resolved, Cancelled
  assistantActiveStates: getStringArrayEnv("ASSISTANT_ACTIVE_STATES", [
    "New",
    "In Progress",
    "On Hold",
    "Pending",
    "Awaiting Info",
    "Work in Progress",
  ]),

  // Troubleshooting assistant configuration
  proactiveTroubleshootingEnabled: getBooleanEnv("PROACTIVE_TROUBLESHOOTING_ENABLED", true),
  autoCmdbLookupEnabled: getBooleanEnv("AUTO_CMDB_LOOKUP_ENABLED", true),
  maxClarifyingQuestions: getNumberEnv("MAX_CLARIFYING_QUESTIONS", 4),

  // CMDB Reconciliation configuration
  cmdbReconciliationEnabled: getBooleanEnv("CMDB_RECONCILIATION_ENABLED", false),
  cmdbReconciliationConfidenceThreshold: getNumberEnv("CMDB_RECONCILIATION_CONFIDENCE_THRESHOLD", 0.7),
  cmdbReconciliationCacheResults: getBooleanEnv("CMDB_RECONCILIATION_CACHE_RESULTS", true),
  cmdbReconciliationAssignmentGroup: process.env.CMDB_RECONCILIATION_ASSIGNMENT_GROUP || "CMDB Administrators",
  cmdbReconciliationSlackChannel: process.env.CMDB_RECONCILIATION_SLACK_CHANNEL || "cmdb-alerts",

  // ITSM Record Creation configuration
  // Only create incidents/problems for cases in these assignment groups
  incidentCreationAllowedGroups: getStringArrayEnv("INCIDENT_CREATION_ALLOWED_GROUPS", [
    "Incident and Case Management",
  ]),

  // Case Escalation configuration
  // Enable/disable automatic escalation for non-BAU cases
  escalationEnabled: getBooleanEnv("ESCALATION_ENABLED", true),
  // Business intelligence score threshold for automatic escalation (0-100)
  escalationBiScoreThreshold: getNumberEnv("ESCALATION_BI_SCORE_THRESHOLD", 20),
  // Default Slack channel for escalations (if no client-specific channel configured)
  escalationDefaultChannel: process.env.ESCALATION_DEFAULT_CHANNEL || "case-escalations",
  // Whether to @mention the assigned engineer in escalation notifications
  escalationNotifyAssignedEngineer: getBooleanEnv("ESCALATION_NOTIFY_ASSIGNED_ENGINEER", true),
  // Whether to use LLM to generate contextual escalation messages
  escalationUseLlmMessages: getBooleanEnv("ESCALATION_USE_LLM_MESSAGES", true),

  // LLM Timeout configurations (in milliseconds)
  // Default timeout for general LLM operations
  llmTimeoutMs: getNumberEnv("LLM_TIMEOUT_MS", 30000), // 30 seconds
  // Timeout for case classification (typically faster)
  llmClassificationTimeoutMs: getNumberEnv("LLM_CLASSIFICATION_TIMEOUT_MS", 15000), // 15 seconds
  // Timeout for KB generation (may take longer)
  llmKBGenerationTimeoutMs: getNumberEnv("LLM_KB_GENERATION_TIMEOUT_MS", 45000), // 45 seconds
  // Timeout for escalation message generation
  llmEscalationTimeoutMs: getNumberEnv("LLM_ESCALATION_TIMEOUT_MS", 20000), // 20 seconds
};
