import { workflowManager, Workflow, NotFoundError } from "../services/workflow-manager";
import { getSlackMessagingService } from "../services/slack-messaging";
import { serviceNowClient } from "../tools/servicenow";
import { createTriageSystemContext } from "../services/case-triage/context";

// This is the expected structure of the payload within the 'SUPERVISOR_REVIEW' workflow
export interface SupervisorReviewStatePayload {
    artifactType: "slack_message" | "servicenow_work_note";
    caseNumber?: string;
    channelId?: string;
    threadTs?: string;
    content: string;
    reason: string;
    metadata?: Record<string, unknown>;
    llmReview?: any | null; // Replace with actual LLM review type
    blockedAt: string;
}

export class SupervisorStateNotFoundError extends Error {
  constructor(workflowId: string) {
    super(`Supervisor workflow ${workflowId} not found or already processed.`);
    this.name = "SupervisorStateNotFoundError";
  }
}

export async function approveSupervisorState(workflowId: string, reviewer: string): Promise<Workflow> {
    if (!workflowManager) {
        throw new Error("WorkflowManager is not available.");
    }
    const workflow = await workflowManager.get(workflowId);
    if (!workflow || workflow.workflowType !== "SUPERVISOR_REVIEW" || workflow.currentState !== 'PENDING_REVIEW') {
        throw new SupervisorStateNotFoundError(workflowId);
    }

    const payload = workflow.payload as SupervisorReviewStatePayload;
    await executeSupervisorState(payload);
    
    const updatedWorkflow = await workflowManager.transition(workflow.id, workflow.version, {
        toState: 'APPROVED',
        lastModifiedBy: reviewer,
        reason: `Approved by ${reviewer}`
    });

    return updatedWorkflow;
}

export async function rejectSupervisorState(workflowId: string, reviewer: string): Promise<Workflow> {
    if (!workflowManager) {
        throw new Error("WorkflowManager is not available.");
    }
    const workflow = await workflowManager.get(workflowId);
    if (!workflow || workflow.workflowType !== "SUPERVISOR_REVIEW" || workflow.currentState !== 'PENDING_REVIEW') {
        throw new SupervisorStateNotFoundError(workflowId);
    }

    const updatedWorkflow = await workflowManager.transition(workflow.id, workflow.version, {
        toState: 'REJECTED',
        lastModifiedBy: reviewer,
        reason: `Rejected by ${reviewer}`
    });

    return updatedWorkflow;
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

    const sysId = (payload.metadata as any)?.sysId;
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
  console.warn(`Unknown artifact type: ${(payload as any).artifactType}`);
  return;
}