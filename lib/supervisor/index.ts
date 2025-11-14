import { createHash } from "node:crypto";
import { getConfigValue } from "../config";
import { getInteractiveStateManager } from "../services/interactive-state-manager";
import type { CaseClassification } from "../services/case-classifier";

const SLACK_CONFIDENCE_THRESHOLD = 0.45;
const SERVICENOW_CONFIDENCE_THRESHOLD = 0.4;
const DEFAULT_SUPERVISOR_EXPIRATION_HOURS = 48;
const MAX_SLACK_MESSAGE_LENGTH = 3500;

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

function getDuplicateWindowMs(): number {
  const minutes = getConfigValue("supervisorDuplicateWindowMinutes");
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
  channelId: string,
  messageTs: string,
  payload: {
    artifactType: "slack_message" | "servicenow_work_note";
    caseNumber?: string;
    channelId?: string;
    threadTs?: string;
    content: string;
    reason: string;
    metadata?: Record<string, unknown>;
  },
  threadTs?: string
): Promise<string | undefined> {
  const manager = getInteractiveStateManager();
  const state = await manager.saveState("supervisor_review", channelId, messageTs, {
    ...payload,
    blockedAt: new Date().toISOString(),
  }, {
    threadTs,
    expiresInHours: DEFAULT_SUPERVISOR_EXPIRATION_HOURS,
  });

  return state?.id;
}

async function notifySupervisorAlert(message: string): Promise<void> {
  const alertChannel = getConfigValue("supervisorAlertChannel");
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
  return !getConfigValue("supervisorEnabled");
}

function isShadowMode(): boolean {
  return Boolean(getConfigValue("supervisorShadowMode"));
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

  if (allReasons.length === 0) {
    return { status: "approved" };
  }

  const reason = allReasons.join("; ");
  await notifySupervisorAlert(
    `Slack artifact violation: ${reason} (channel ${input.channelId})`
  );

  if (isShadowMode()) {
    console.warn(`[Supervisor][Shadow] ${reason}`);
    return { status: "approved", reason };
  }

  const stateId = await persistSupervisorState(
    input.channelId,
    `${input.threadTs}-${Date.now()}`,
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
    },
    input.threadTs
  );

  return {
    status: "blocked",
    reason,
    stateId,
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

  if (allReasons.length === 0) {
    return { status: "approved" };
  }

  const reason = allReasons.join("; ");
  await notifySupervisorAlert(
    `ServiceNow artifact violation: ${reason} (case ${input.caseNumber ?? "unknown"})`
  );

  if (isShadowMode()) {
    console.warn(`[Supervisor][Shadow] ${reason}`);
    return { status: "approved", reason };
  }

  const caseIdentifier = input.caseNumber ?? "unknown";
  const stateId = await persistSupervisorState(
    `servicenow:${caseIdentifier}`,
    `${Date.now()}`,
    {
      artifactType: "servicenow_work_note",
      caseNumber: input.caseNumber,
      content: input.content,
      reason,
      metadata: input.metadata,
    }
  );

  return {
    status: "blocked",
    reason,
    stateId,
  };
}

export function __resetSupervisorCaches(): void {
  recentSlackArtifacts.clear();
  recentWorkNotes.clear();
}
