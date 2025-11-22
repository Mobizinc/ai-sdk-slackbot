import { createHash } from "node:crypto";
import { getSupervisorEnabled, getSupervisorShadowMode, getSupervisorDuplicateWindowMinutes, getSupervisorAlertChannel } from "../config/helpers";
import { workflowManager } from "../services/workflow-manager";
import type { CaseClassification } from "../services/case-classifier";
import { runSupervisorLlmReview, type SupervisorLlmReview } from "./llm-reviewer";

const SLACK_CONFIDENCE_THRESHOLD = 0.45;
const SERVICENOW_CONFIDENCE_THRESHOLD = 0.4;
const DEFAULT_SUPERVISOR_EXPIRATION_HOURS = 48;
const MAX_SLACK_MESSAGE_LENGTH = 3500;
const WORKFLOW_TYPE_SUPERVISOR_REVIEW = "SUPERVISOR_REVIEW";

// Structured logging utility
function logSupervisorEvent(level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, any>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    service: 'supervisor',
    level,
    message,
    ...metadata
  };

  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

interface SupervisorMetadata {
  requiresSections?: boolean;
  duplicateKey?: string;
  contextCaseNumbers?: string[];
  artifactLabel?: string;
  sysId?: string;
  [key: string]: any; // Index signature for flexibility
}

export type SupervisorDecisionStatus = "approved" | "blocked";

export interface SupervisorDecision {
  status: SupervisorDecisionStatus;
  reason?: string;
  stateId?: string;
  llmReview?: SupervisorLlmReview | null;
}

interface BaseArtifactInput {
  caseNumber?: string;
  classification?: CaseClassification;
  content: string;
  metadata?: SupervisorMetadata;
}

export interface SlackArtifactInput extends BaseArtifactInput {
  channelId: string;
  threadTs: string;
}

export interface ServiceNowArtifactInput extends BaseArtifactInput {}

const recentSlackArtifacts = new Map<string, { hash: string; timestamp: number }>();
const recentWorkNotes = new Map<string, { hash: string; timestamp: number }>();
const llmReviewCache = new Map<string, { result: SupervisorLlmReview; timestamp: number }>();

// Circuit breaker for LLM review failures
let llmCircuitBreaker = {
  failures: 0,
  lastFailureTime: 0,
  state: 'closed' as 'closed' | 'open',
  nextAttemptTime: 0
};

const LLM_FAILURE_THRESHOLD = 3;
const LLM_RESET_TIMEOUT = 60000; // 1 minute
const LLM_CACHE_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

function getDuplicateWindowMs(): number {
  const minutes = getSupervisorDuplicateWindowMinutes();
  if (typeof minutes !== "number" || Number.isNaN(minutes) || minutes <= 0) {
    return 5 * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

function shouldBlockByConfidence(
  classification: CaseClassification | undefined,
  threshold: number
): boolean {
  if (!classification) {
    return false;
  }
  if (typeof classification.confidence_score !== "number") {
    return false;
  }
  return classification.confidence_score < threshold;
}

function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

function checkDuplicate(
  cache: Map<string, { hash: string; timestamp: number }>,
  key: string,
  hash: string
): boolean {
  const now = Date.now();
  const windowMs = getDuplicateWindowMs();
  const existing = cache.get(key);
  const isDuplicate = Boolean(
    existing &&
      existing.hash === hash &&
      now - existing.timestamp <= windowMs
  );
  cache.set(key, { hash, timestamp: now });
  return isDuplicate;
}

function evaluateSlackViolations(input: SlackArtifactInput): string[] {
  const violations: string[] = [];
  const trimmed = input.content.trim();

  if (!trimmed) {
    violations.push("Slack message is empty");
  }

  if (trimmed.length > MAX_SLACK_MESSAGE_LENGTH) {
    violations.push("Slack message exceeds maximum length");
  }

  const duplicateKey =
    input.metadata?.duplicateKey ??
    `${input.channelId}:${input.threadTs || "root"}`;
  if (duplicateKey) {
    const hash = hashContent(trimmed);
    if (checkDuplicate(recentSlackArtifacts, duplicateKey, hash)) {
      violations.push("Duplicate Slack message detected in recent window");
    }
  }

  if (input.metadata?.requiresSections) {
    const hasSummary = /\*Summary\*/i.test(trimmed);
    const hasState = /\*Current State\*/i.test(trimmed);
    if (!hasSummary || !hasState) {
      violations.push("Structured response missing required sections (Summary/Current State)");
    }
  }

  return violations;
}

function evaluateWorkNoteViolations(input: ServiceNowArtifactInput): string[] {
  const violations: string[] = [];
  const trimmed = input.content.trim();

  if (!trimmed) {
    violations.push("ServiceNow work note is empty");
  }

  const duplicateKey =
    input.metadata?.duplicateKey ?? input.caseNumber ?? "unknown";
  if (duplicateKey) {
    const hash = hashContent(trimmed);
    if (checkDuplicate(recentWorkNotes, duplicateKey, hash)) {
      violations.push("Duplicate ServiceNow work note detected in recent window");
    }
  }

  return violations;
}

async function persistSupervisorState(
  referenceId: string,
  payload: {
    artifactType: "slack_message" | "servicenow_work_note";
    caseNumber?: string;
    channelId?: string;
    threadTs?: string;
    content: string;
    reason: string;
    metadata?: Record<string, unknown>;
    llmReview?: SupervisorLlmReview | null;
  },
  contextKey?: string,
): Promise<string | undefined> {
    if (!workflowManager) {
        logSupervisorEvent('error', 'WorkflowManager not available, cannot persist review state', { referenceId });
        return undefined;
    }
    
    const workflow = await workflowManager.start({
        workflowType: WORKFLOW_TYPE_SUPERVISOR_REVIEW,
        workflowReferenceId: referenceId,
        initialState: 'PENDING_REVIEW',
        payload: {
            ...payload,
            blockedAt: new Date().toISOString(),
        },
        contextKey,
        expiresInSeconds: DEFAULT_SUPERVISOR_EXPIRATION_HOURS * 3600,
    });

  return workflow?.id;
}

async function notifySupervisorAlert(message: string): Promise<void> {
  const alertChannel = getSupervisorAlertChannel();
  if (!alertChannel) {
    console.warn(`[Supervisor] ${message}`);
    return;
  }

  try {
    const { getSlackMessagingService } = await import("../services/slack-messaging");
    const messaging = getSlackMessagingService();
    await messaging.postMessage({
      channel: alertChannel,
      text: `:warning: ${message}`,
    });
  } catch (error) {
    console.warn("[Supervisor] Failed to send alert to Slack:", error);
  }
}

function supervisorDisabled(): boolean {
  return !getSupervisorEnabled();
}

function isShadowMode(): boolean {
  return Boolean(getSupervisorShadowMode());
}

export async function reviewSlackArtifact(
  input: SlackArtifactInput
): Promise<SupervisorDecision> {
  if (supervisorDisabled()) {
    return { status: "approved" };
  }

  const shouldBlock = shouldBlockByConfidence(
    input.classification,
    SLACK_CONFIDENCE_THRESHOLD
  );
  const violations = evaluateSlackViolations(input);
  const allReasons = [
    ...(shouldBlock ? ["Low confidence classification"] : []),
    ...violations,
  ];

  const llmReview = await maybeRunLlmReview({
    artifactType: "slack_message",
    content: input.content,
    caseNumber: input.caseNumber,
    classification: input.classification,
  });

  if (allReasons.length === 0) {
    // Capture approved artifact as muscle memory exemplar (async, non-blocking)
    captureApprovedArtifact({
      artifactType: "slack_message",
      caseNumber: input.caseNumber,
      classification: input.classification,
      content: input.content,
      llmReview,
    }).catch((err) => console.error("[MuscleMemory] Slack capture failed:", err));

    return { status: "approved", llmReview };
  }

  const reason = allReasons.join("; ");
  await notifySupervisorAlert(
    `Slack artifact violation: ${reason} (channel ${input.channelId})`
  );

  if (isShadowMode()) {
    console.warn(`[Supervisor][Shadow] ${reason}`);
    return { status: "approved", reason, llmReview };
  }

  const referenceId = `${input.channelId}:${input.threadTs || "root"}`;
  const contextKey = `slack:${input.channelId}:${input.threadTs || "root"}:${Date.now()}`;

  const stateId = await persistSupervisorState(
    referenceId,
    {
      artifactType: "slack_message",
      caseNumber: input.caseNumber,
      channelId: input.channelId,
      threadTs: input.threadTs,
      content: input.content,
      reason,
      metadata: {
        classification: input.classification,
        violations,
      },
      llmReview,
    },
    contextKey
  );

  return {
    status: "blocked",
    reason,
    stateId,
    llmReview,
  };
}

export async function reviewServiceNowArtifact(
  input: ServiceNowArtifactInput
): Promise<SupervisorDecision> {
  if (supervisorDisabled()) {
    return { status: "approved" };
  }

  const shouldBlock = shouldBlockByConfidence(
    input.classification,
    SERVICENOW_CONFIDENCE_THRESHOLD
  );
  const violations = evaluateWorkNoteViolations(input);
  const allReasons = [
    ...(shouldBlock ? ["Low confidence classification"] : []),
    ...violations,
  ];

  const llmReview = await maybeRunLlmReview({
    artifactType: "servicenow_work_note",
    content: input.content,
    caseNumber: input.caseNumber,
    classification: input.classification,
  });

  if (allReasons.length === 0) {
    // Capture approved artifact as muscle memory exemplar (async, non-blocking)
    captureApprovedArtifact({
      artifactType: "servicenow_work_note",
      caseNumber: input.caseNumber,
      classification: input.classification,
      content: input.content,
      llmReview,
    }).catch((err) => console.error("[MuscleMemory] ServiceNow capture failed:", err));

    return { status: "approved", llmReview };
  }

  const reason = allReasons.join("; ");
  await notifySupervisorAlert(
    `ServiceNow artifact violation: ${reason} (case ${input.caseNumber ?? "unknown"})`
  );

  if (isShadowMode()) {
    console.warn(`[Supervisor][Shadow] ${reason}`);
    return { status: "approved", reason, llmReview };
  }

  const caseIdentifier = input.caseNumber ?? "unknown";
  const referenceId = `servicenow:${caseIdentifier}`;
  const contextKey = `${referenceId}:${Date.now()}`;

  const stateId = await persistSupervisorState(
    referenceId,
    {
      artifactType: "servicenow_work_note",
      caseNumber: input.caseNumber,
      content: input.content,
      reason,
      metadata: input.metadata,
      llmReview,
    },
    contextKey,
  );

  return {
    status: "blocked",
    reason,
    stateId,
    llmReview,
  };
}

// Periodic cleanup of LLM cache
setInterval(() => {
  const now = Date.now();
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  for (const [key, value] of llmReviewCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      llmReviewCache.delete(key);
    }
  }

  console.log(`[Supervisor][Cache] Cleaned up LLM cache, ${llmReviewCache.size} entries remaining`);
}, LLM_CACHE_CLEANUP_INTERVAL);

export function __resetSupervisorCaches(): void {
  recentSlackArtifacts.clear();
  recentWorkNotes.clear();
  llmReviewCache.clear();
  llmCircuitBreaker = {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed',
    nextAttemptTime: 0
  };
}

async function maybeRunLlmReview(params: {
  artifactType: "slack_message" | "servicenow_work_note";
  content: string;
  caseNumber?: string;
  classification?: CaseClassification;
}): Promise<SupervisorLlmReview | null> {
  try {
    // Check circuit breaker
    if (llmCircuitBreaker.state === 'open') {
      if (Date.now() < llmCircuitBreaker.nextAttemptTime) {
        logSupervisorEvent('warn', 'LLM circuit breaker open, skipping review', {
      artifactType: params.artifactType,
      caseNumber: params.caseNumber
    });
        return null;
      }
      // Attempt to close circuit breaker
      llmCircuitBreaker.state = 'closed';
      llmCircuitBreaker.failures = 0;
    }

    // Confidence-based gating: skip LLM review for high-confidence classifications
    const confidence = params.classification?.confidence_score;
    if (confidence && confidence > 0.8) {
      console.log(`[Supervisor][LLM] Skipping review for high-confidence classification (${confidence.toFixed(2)})`);
      return null;
    }

    // Check cache for recent identical content
    const cacheKey = `${params.artifactType}:${createHash("sha256").update(params.content).digest("hex")}`;
    const cached = llmReviewCache.get(cacheKey);
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[Supervisor][LLM] Using cached review result`);
      return cached.result;
    }

    const result = await runSupervisorLlmReview(params);

    // Reset circuit breaker on success
    llmCircuitBreaker.failures = 0;

    // Cache the result
    if (result) {
      llmReviewCache.set(cacheKey, { result, timestamp: Date.now() });
    }

    return result;
  } catch (error) {
    // Update circuit breaker on failure
    llmCircuitBreaker.failures++;
    llmCircuitBreaker.lastFailureTime = Date.now();

    if (llmCircuitBreaker.failures >= LLM_FAILURE_THRESHOLD) {
      llmCircuitBreaker.state = 'open';
      llmCircuitBreaker.nextAttemptTime = Date.now() + LLM_RESET_TIMEOUT;
      logSupervisorEvent('warn', 'LLM circuit breaker opened', {
        failures: llmCircuitBreaker.failures,
        resetTime: new Date(llmCircuitBreaker.nextAttemptTime).toISOString()
      });
    }

    console.warn("[Supervisor][LLM] Unable to run review:", error);
    return null;
  }
}

/**
 * Capture approved supervisor artifacts as muscle memory exemplars
 * Runs asynchronously and non-blocking to avoid impacting response times
 */
async function captureApprovedArtifact(params: {
  artifactType: "slack_message" | "servicenow_work_note";
  caseNumber?: string;
  classification?: CaseClassification;
  content: string;
  llmReview: SupervisorLlmReview | null;
}): Promise<void> {
  try {
    // Dynamic import to avoid circular dependencies and reduce initial bundle size
    const { muscleMemoryService, qualityDetector } = await import("../services/muscle-memory");

    // Detect supervisor approval quality signal
    const supervisorSignal = qualityDetector.detectSupervisorSignal({
      status: "approved",
      llmReview: params.llmReview,
    });

    // Prepare quality signals array (only include if not null)
    const qualitySignals = supervisorSignal ? [supervisorSignal] : [];

    // Prepare interaction capture
    const interactionType = params.artifactType === "slack_message" ? "triage" : "triage";
    await muscleMemoryService.captureExemplar({
      caseNumber: params.caseNumber || "UNKNOWN",
      interactionType,
      inputContext: {
        userRequest: params.content.substring(0, 500), // Truncate for embedding efficiency
      },
      actionTaken: {
        agentType: "supervisor",
        classification: params.classification,
        workNotes: [params.content.substring(0, 300)], // Brief summary for context
      },
      outcome: "success", // Approval indicates success
      qualitySignals,
    });

    console.log(`[MuscleMemory] Captured ${params.artifactType} approval for case ${params.caseNumber || "UNKNOWN"}`);
  } catch (error) {
    // Log but don't throw - muscle memory capture should never break supervisor flow
    console.error("[MuscleMemory] Failed to capture approved artifact:", error);
  }
}