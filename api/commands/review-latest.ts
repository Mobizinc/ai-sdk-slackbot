import { verifyRequest } from "../../lib/slack-utils";
import { workflowManager, Workflow } from "../../lib/services/workflow-manager";
import { approveSupervisorState, rejectSupervisorState, SupervisorStateNotFoundError } from "../../lib/supervisor/actions";
import { getQStashClient, getWorkerUrl } from "../../lib/queue/qstash-client";
import { supervisorRequestBatcher } from "../../lib/supervisor/batcher";

interface SupervisorReviewStatePayload {
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

interface LlmIssue {
    severity: string;
    description: string;
    recommendation?: string;
}


export async function POST(request: Request) {
  if (!workflowManager) {
    return new Response(JSON.stringify({ response_type: "ephemeral", text: "Error: WorkflowManager is not available." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
  }

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
    const listArgs = args[0] === "list" ? args.slice(1) : args;
    const filters = parseListFilters(listArgs);
    return listPendingStates(filters);
  }

  if (args[0] === "approve" && args[1]) {
    return approveState(args[1], payload.userId);
  }

  if (args[0] === "reject" && args[1]) {
    return rejectState(args[1], payload.userId);
  }

  return helpResponse(
    "Usage: `/review-latest [list|approve <workflow_id>|reject <workflow_id>]`"
  );
}

type ArtifactFilter = "slack_message" | "servicenow_work_note";
type VerdictFilter = "pass" | "revise" | "critical";

interface ListFilters {
  typeFilter?: ArtifactFilter;
  verdictFilter?: VerdictFilter;
  minAgeMinutes?: number;
  limit?: number;
}

const DEFAULT_LIST_LIMIT = 5;

async function listPendingStates(options: ListFilters = {}): Promise<CommandResponse> {
  if (!workflowManager) {
      return { status: 500, body: { response_type: "ephemeral", text: "WorkflowManager not available." } };
  }
  const states = await workflowManager.findByTypeAndState("SUPERVISOR_REVIEW", "PENDING_REVIEW");

  if (states.length === 0) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "No supervisor reviews pending. 🎉",
      },
    };
  }

  const filtered = states.filter((state) => {
    const payload = state.payload as SupervisorReviewStatePayload;
    if (options.typeFilter && payload.artifactType !== options.typeFilter) {
      return false;
    }
    if (options.verdictFilter && payload.llmReview?.verdict !== options.verdictFilter) {
      return false;
    }
    if (options.minAgeMinutes && options.minAgeMinutes > 0) {
      const ageMinutes =
        (Date.now() - new Date(payload.blockedAt).getTime()) / (60 * 1000);
      if (ageMinutes < options.minAgeMinutes) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    const filtersUsed: string[] = [];
    if (options.typeFilter) {
      filtersUsed.push(options.typeFilter === "slack_message" ? "Slack" : "ServiceNow");
    }
    if (options.verdictFilter) {
      filtersUsed.push(`${options.verdictFilter} verdicts`);
    }
    if (options.minAgeMinutes && options.minAgeMinutes > 0) {
      filtersUsed.push(`age ≥ ${options.minAgeMinutes}m`);
    }
    const filterText = filtersUsed.length > 0 ? filtersUsed.join(", ") : "current filters";
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `No artifacts match ${filterText}.`,
      },
    };
  }

  const limit = options.limit && options.limit > 0 ? options.limit : DEFAULT_LIST_LIMIT;
  const sorted = filtered.sort((a, b) =>
    new Date((b.payload as SupervisorReviewStatePayload).blockedAt).getTime() - new Date((a.payload as SupervisorReviewStatePayload).blockedAt).getTime()
  );

  const rows = sorted.slice(0, limit).map((state) => formatStateRow(state));

  const filterSummaryParts: string[] = [];
  if (options.typeFilter) {
    filterSummaryParts.push(options.typeFilter === "slack_message" ? "Slack" : "ServiceNow");
  }
  if (options.verdictFilter) {
    filterSummaryParts.push(`verdict=${options.verdictFilter}`);
  }
  if (options.minAgeMinutes && options.minAgeMinutes > 0) {
    filterSummaryParts.push(`age ≥ ${options.minAgeMinutes}m`);
  }
  if (limit !== DEFAULT_LIST_LIMIT) {
    filterSummaryParts.push(`limit=${limit}`);
  }
  const filterSummary = filterSummaryParts.length > 0 ? `Filters: ${filterSummaryParts.join(" | ")}` :
    "Filters: type=slack | type=servicenow | verdict=critical | min=10 | limit=3";

  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text:
        `Pending supervisor reviews (use key-value filters like \`type=slack verdict=revise min=15 limit=3\`):\n` +
        `${rows.join("\n\n")} \n\n${filterSummary}\nApprove with \`/review-latest approve <workflow_id>\`, reject with \`/review-latest reject <workflow_id>\`.
      `,
    },
  };
}

function formatStateRow(state: Workflow): string {
    const payload = state.payload as SupervisorReviewStatePayload;
    const typeLabel = payload.artifactType === "slack_message" ? "Slack response" : "ServiceNow work note";
    const caseRef = payload.caseNumber ? ` for ${payload.caseNumber}` : "";
    const ageMinutes = Math.round((Date.now() - new Date(payload.blockedAt).getTime()) / (60 * 1000));
    const etaText = deriveEtaText(payload);
    const verdict = payload.llmReview?.verdict
      ? `${payload.llmReview.verdict.toUpperCase()}${payload.llmReview.confidence ? ` (${Math.round(payload.llmReview.confidence * 100)}%)` : ""}`
      : "UNKNOWN";
  
    const lines = [
      `• *${state.id}*: ${typeLabel}${caseRef}`,
      `   Reason: ${payload.reason}`,
      `   Age: ${ageMinutes}m | ${etaText}`,
      `   Verdict: ${verdict}`,
    ];
  
    if (payload.llmReview?.summary) {
      lines.push(`   LLM: ${payload.llmReview.summary}`);
    } else {
      lines.push("   LLM: (no feedback)");
    }
  
    const issueLines = formatIssueLines(payload);
    if (issueLines.length > 0) {
      lines.push(...issueLines.map((line) => `   ${line}`));
    }
  
    const metadataParts: string[] = [];
    if (payload.channelId) {
      metadataParts.push(`channel ${payload.channelId}`);
    }
    if (payload.threadTs) {
      metadataParts.push(`thread ${payload.threadTs}`);
    }
    if (metadataParts.length > 0) {
      lines.push(`   Context: ${metadataParts.join(" | ")}`);
    }
  
    return lines.join("\n");
}

function formatIssueLines(payload: SupervisorReviewStatePayload): string[] {
  const issues: LlmIssue[] = payload.llmReview?.issues ?? [];
  if (issues.length === 0) {
    return [];
  }

  return issues.slice(0, 3).map((issue: LlmIssue, index: number) => {
    const recommendation = issue.recommendation ? ` — ${issue.recommendation}` : "";
    return `${index + 1}. [${issue.severity}] ${issue.description}${recommendation}`;
  });
}

async function approveState(workflowId: string, userId: string): Promise<CommandResponse> {
  const qstashClient = getQStashClient();

  if (qstashClient) {
    try {
      // Use batching for supervisor approvals
      await supervisorRequestBatcher.addRequest(workflowId, userId, async (requests) => {
        // Process batch of requests
        for (const request of requests) {
          await qstashClient.publishJSON({
            url: getWorkerUrl('/api/workers/process-supervisor-approval'),
            body: {
              workflowId: request.workflowId,
              reviewer: request.reviewer,
            },
          });
        }
      });

      const pendingCount = supervisorRequestBatcher.getPendingCount();
      return {
        status: 200,
        body: {
          response_type: 'ephemeral',
          text: `✅ Approval for workflow ${workflowId} queued (${pendingCount} pending).`,
        },
      };
    } catch (error) {
      console.error('[\/review-latest] Failed to enqueue supervisor approval job:', error);
      return {
        status: 200,
        body: {
          response_type: 'ephemeral',
          text: '⚠️ Failed to enqueue approval job. Please try again.',
        },
      };
    }
  }

  // Fallback to synchronous behavior if QStash is not configured
  try {
    const state = await approveSupervisorState(workflowId, userId);
    const payload = state.payload as SupervisorReviewStatePayload;
    const llmSummary = payload.llmReview?.summary
      ? `\nLLM QA: ${payload.llmReview.summary}`
      : "";

    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `✅ Approved workflow ${workflowId} for case ${payload.caseNumber || 'unknown'}.${llmSummary}`,
      },
    };
  } catch (error) {
    console.error('[\/review-latest] Failed to approve supervisor state:', error);
    return {
      status: 200,
      body: {
        response_type: 'ephemeral',
        text: '❌ Failed to approve workflow. Please try again.',
      },
    };
  }
  }

async function rejectState(workflowId: string, userId: string): Promise<CommandResponse> {
  try {
    await rejectSupervisorState(workflowId, userId);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `🚫 Rejected workflow ${workflowId}.`,
      },
    };
  } catch (error) {
    if (error instanceof SupervisorStateNotFoundError) {
      return notFoundResponse(workflowId);
    }
    console.error("[\/review-latest] Failed to reject supervisor state:", error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `⚠️ Failed to reject state ${workflowId}: ${ 
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
    };
  }
}

function notFoundResponse(stateId: string): CommandResponse {
  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: `Workflow \`${stateId}\` not found or already processed.`,
    },
  };
}

function helpResponse(message: string): CommandResponse {
  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text:
        `${message}\nExamples: \`/review-latest list type=slack verdict=critical min=15 limit=3\`, \`/review-latest list servicenow 30\`.
      `,
    },
  };
}

function deriveEtaText(payload: SupervisorReviewStatePayload): string {
  if (!payload.llmReview) {
    return "LLM feedback unavailable";
  }

  switch (payload.llmReview.verdict) {
    case "pass":
      return "Ready to ship";
    case "revise":
      return "Needs human edits";
    case "critical":
      return "High-risk – review ASAP";
    default:
      return "Pending";
  }
}

function parseListFilters(tokens: string[]): ListFilters {
  const filters: ListFilters = { limit: DEFAULT_LIST_LIMIT };

  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const normalized = token.toLowerCase();

    if (normalized === "slack" || normalized === "slack_message" || normalized === "type=slack") {
      filters.typeFilter = "slack_message";
      continue;
    }
    if (
      normalized === "servicenow" ||
      normalized === "sn" ||
      normalized === "servicenow_work_note" ||
      normalized === "type=servicenow"
    ) {
      filters.typeFilter = "servicenow_work_note";
      continue;
    }

    const [rawKey, rawValue] = token.split("=");
    if (rawValue) {
      const key = rawKey.toLowerCase();
      const value = rawValue.toLowerCase();
      if (key === "type") {
        filters.typeFilter = value.startsWith("slack") ? "slack_message" : value.startsWith("service") ? "servicenow_work_note" : filters.typeFilter;
        continue;
      }
      if (key === "verdict" && ["pass", "revise", "critical"].includes(value)) {
        filters.verdictFilter = value as VerdictFilter;
        continue;
      }
      if (["min", "age", "minage", "minutes"].includes(key)) {
        const parsed = Number(rawValue);
        if (!Number.isNaN(parsed)) {
          filters.minAgeMinutes = parsed;
        }
        continue;
      }
      if (key === "limit") {
        const parsed = Number(rawValue);
        if (!Number.isNaN(parsed)) {
          filters.limit = parsed;
        }
        continue;
      }
    }

    const numeric = Number(token);
    if (!Number.isNaN(numeric)) {
      filters.minAgeMinutes = numeric;
      continue;
    }
  }

  return filters;
}