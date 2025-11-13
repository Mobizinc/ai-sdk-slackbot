import { verifyRequest } from "../../lib/slack-utils";
import { getInteractiveStateManager, type SupervisorReviewStatePayload } from "../../lib/services/interactive-state-manager";
import { getSlackMessagingService } from "../../lib/services/slack-messaging";
import { serviceNowClient } from "../../lib/tools/servicenow";
import { createTriageSystemContext } from "../../lib/services/case-triage/context";

const stateManager = getInteractiveStateManager();
const slackMessaging = getSlackMessagingService();

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = await verifyRequest({
    requestType: "command",
    request,
    rawBody,
  });

  if (verification instanceof Response) {
    return verification;
  }

  const params = new URLSearchParams(rawBody);
  const payload = {
    text: params.get("text") ?? "",
    userId: params.get("user_id") ?? "",
  };

  const response = await handleReviewCommand(payload);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

interface CommandPayload {
  text: string;
  userId: string;
}

interface CommandResponse {
  status: number;
  body: Record<string, unknown>;
}

async function handleReviewCommand(payload: CommandPayload): Promise<CommandResponse> {
  const args = payload.text.trim().split(/\s+/).filter(Boolean);

  if (args.length === 0 || args[0] === "list") {
    return listPendingStates();
  }

  if (args[0] === "approve" && args[1]) {
    return approveState(args[1], payload.userId);
  }

  if (args[0] === "reject" && args[1]) {
    return rejectState(args[1], payload.userId);
  }

  return helpResponse(
    "Usage: `/review-latest [list|approve <state_id>|reject <state_id>]`"
  );
}

async function listPendingStates(): Promise<CommandResponse> {
  const states = await stateManager.getPendingStatesByType("supervisor_review");
  if (states.length === 0) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "No supervisor reviews pending. 🎉",
      },
    };
  }

  const rows = states.slice(0, 5).map((state) => {
    const payload = state.payload;
    const typeLabel =
      payload.artifactType === "slack_message" ? "Slack response" : "ServiceNow work note";
    const caseRef = payload.caseNumber ? ` for ${payload.caseNumber}` : "";
    return `• *${state.id}*: ${typeLabel}${caseRef} — ${payload.reason}`;
  });

  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: `Pending supervisor reviews:\n${rows.join("\n")}\n\nApprove with \`/review-latest approve <state_id>\`.`,
    },
  };
}

async function approveState(stateId: string, userId: string): Promise<CommandResponse> {
  const state = await stateManager.getStateById<"supervisor_review">(stateId);
  if (!state || state.type !== "supervisor_review") {
    return notFoundResponse(stateId);
  }

  try {
    await executeSupervisorState(state.payload);

    await stateManager.markProcessed(
      state.channelId,
      state.messageTs,
      userId,
      "approved"
    );

    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `✅ Approved state ${stateId} (${state.payload.artifactType}).`,
      },
    };
  } catch (error) {
    console.error("[/review-latest] Failed to execute supervisor state:", error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `⚠️ Failed to execute state ${stateId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
    };
  }
}

async function rejectState(stateId: string, userId: string): Promise<CommandResponse> {
  const state = await stateManager.getStateById<"supervisor_review">(stateId);
  if (!state || state.type !== "supervisor_review") {
    return notFoundResponse(stateId);
  }

  await stateManager.markProcessed(
    state.channelId,
    state.messageTs,
    userId,
    "rejected"
  );

  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: `🚫 Rejected state ${stateId}.`,
    },
  };
}

async function executeSupervisorState(
  payload: SupervisorReviewStatePayload
): Promise<void> {
  if (payload.artifactType === "slack_message") {
    if (!payload.channelId) {
      throw new Error("Missing channelId on supervisor payload");
    }
    if (!payload.threadTs) {
      throw new Error("Missing thread timestamp for Slack artifact");
    }
    await slackMessaging.postToThread({
      channel: payload.channelId,
      threadTs: payload.threadTs,
      text: payload.content,
      unfurlLinks: false,
    });
    return;
  }

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
}

function notFoundResponse(stateId: string): CommandResponse {
  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: `State \`${stateId}\` not found or already processed.`,
    },
  };
}

function helpResponse(message: string): CommandResponse {
  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: message,
    },
  };
}
