import { getInteractiveStateManager } from "../services/interactive-state-manager";
import type { CaseClassification } from "../services/case-classifier";

const SLACK_CONFIDENCE_THRESHOLD = 0.45;
const SERVICENOW_CONFIDENCE_THRESHOLD = 0.4;
const DEFAULT_SUPERVISOR_EXPIRATION_HOURS = 48;

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
  metadata?: Record<string, unknown>;
}

export interface SlackArtifactInput extends BaseArtifactInput {
  channelId: string;
  threadTs: string;
}

export interface ServiceNowArtifactInput extends BaseArtifactInput {}

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

export async function reviewSlackArtifact(
  input: SlackArtifactInput
): Promise<SupervisorDecision> {
  const shouldBlock = shouldBlockByConfidence(
    input.classification,
    SLACK_CONFIDENCE_THRESHOLD
  );

  if (!shouldBlock) {
    return { status: "approved" };
  }

  const reason = "Supervisor review required (low confidence classification)";
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
  const shouldBlock = shouldBlockByConfidence(
    input.classification,
    SERVICENOW_CONFIDENCE_THRESHOLD
  );

  if (!shouldBlock) {
    return { status: "approved" };
  }

  const caseIdentifier = input.caseNumber ?? "unknown";
  const reason = "Supervisor review required before writing to ServiceNow";
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
