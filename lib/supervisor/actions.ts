import { getInteractiveStateManager, type SupervisorReviewStatePayload } from "../services/interactive-state-manager";
import { getSlackMessagingService } from "../services/slack-messaging";
import { serviceNowClient } from "../tools/servicenow";
import { createTriageSystemContext } from "../services/case-triage/context";

export class SupervisorStateNotFoundError extends Error {
  constructor(stateId: string) {
    super(`Supervisor state ${stateId} not found or already processed.`);
    this.name = "SupervisorStateNotFoundError";
  }
}

export async function approveSupervisorState(stateId: string, reviewer: string) {
  const manager = getInteractiveStateManager();
  const state = await manager.getStateById<"supervisor_review">(stateId);
  if (!state || state.type !== "supervisor_review") {
    throw new SupervisorStateNotFoundError(stateId);
  }

  await executeSupervisorState(state.payload);
  await manager.markProcessed(state.channelId, state.messageTs, reviewer, "approved");

  return state;
}

export async function rejectSupervisorState(stateId: string, reviewer: string) {
  const manager = getInteractiveStateManager();
  const state = await manager.getStateById<"supervisor_review">(stateId);
  if (!state || state.type !== "supervisor_review") {
    throw new SupervisorStateNotFoundError(stateId);
  }

  await manager.markProcessed(state.channelId, state.messageTs, reviewer, "rejected");
  return state;
}

export async function executeSupervisorState(
  payload: SupervisorReviewStatePayload
): Promise<void> {
  if (payload.artifactType === "slack_message") {
    if (!payload.channelId) {
      throw new Error("Missing channelId on supervisor payload");
    }
    if (!payload.threadTs) {
      throw new Error("Missing thread timestamp for Slack artifact");
    }
    const messaging = getSlackMessagingService();
    await messaging.postToThread({
      channel: payload.channelId,
      threadTs: payload.threadTs,
      text: payload.content,
      unfurlLinks: false,
    });
    return;
  }

  if (payload.artifactType === "servicenow_work_note") {
    if (!payload.caseNumber) {
      throw new Error("Missing case number for ServiceNow artifact");
    }

    const sysId = payload.metadata?.sysId;
    if (!sysId) {
      throw new Error("Missing sys_id in supervisor metadata");
    }

    if (!serviceNowClient.isConfigured()) {
      throw new Error("ServiceNow client not configured");
    }

    const snContext = createTriageSystemContext();
    await serviceNowClient.addCaseWorkNote(sysId, payload.content, true, snContext);
    return;
  }

  // Handle unknown artifact types gracefully
  console.warn(`Unknown artifact type: ${payload.artifactType}`);
  return;
}
