import { verifyRequest } from "../../lib/slack-utils";
import { getInteractiveStateManager, type SupervisorReviewStatePayload } from "../../lib/services/interactive-state-manager";
import { approveSupervisorState, rejectSupervisorState, SupervisorStateNotFoundError } from "../../lib/supervisor/actions";

const stateManager = getInteractiveStateManager();

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
    "Usage: `/review-latest [list|approve <state_id>|reject <state_id>]`"
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

  const filtered = states.filter((state) => {
    if (options.typeFilter && state.payload.artifactType !== options.typeFilter) {
      return false;
    }
    if (options.verdictFilter && state.payload.llmReview?.verdict !== options.verdictFilter) {
      return false;
    }
    if (options.minAgeMinutes && options.minAgeMinutes > 0) {
      const ageMinutes =
        (Date.now() - new Date(state.payload.blockedAt).getTime()) / (60 * 1000);
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
    new Date(b.payload.blockedAt).getTime() - new Date(a.payload.blockedAt).getTime()
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
        `${rows.join("\n\n")}\n\n${filterSummary}\nApprove with \`/review-latest approve <state_id>\`, reject with \`/review-latest reject <state_id>\`.`,
    },
  };
}

function formatStateRow(state: { id: string; payload: SupervisorReviewStatePayload }): string {
  const payload = state.payload;
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
  const issues = payload.llmReview?.issues ?? [];
  if (issues.length === 0) {
    return [];
  }

  return issues.slice(0, 3).map((issue, index) => {
    const recommendation = issue.recommendation ? ` — ${issue.recommendation}` : "";
    return `${index + 1}. [${issue.severity}] ${issue.description}${recommendation}`;
  });
}

async function approveState(stateId: string, userId: string): Promise<CommandResponse> {
  try {
    const state = await approveSupervisorState(stateId, userId);
    const llmSummary = state.payload.llmReview?.summary
      ? `\nLLM QA: ${state.payload.llmReview.summary}`
      : "";

    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `✅ Approved state ${stateId} (${state.payload.artifactType}).${llmSummary}`,
      },
    };
  } catch (error) {
    if (error instanceof SupervisorStateNotFoundError) {
      return notFoundResponse(stateId);
    }
    console.error("[/review-latest] Failed to approve supervisor state:", error);
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
  try {
    await rejectSupervisorState(stateId, userId);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `🚫 Rejected state ${stateId}.`,
      },
    };
  } catch (error) {
    if (error instanceof SupervisorStateNotFoundError) {
      return notFoundResponse(stateId);
    }
    console.error("[/review-latest] Failed to reject supervisor state:", error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `⚠️ Failed to reject state ${stateId}: ${
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
      text: `State \`${stateId}\` not found or already processed.`,
    },
  };
}

function helpResponse(message: string): CommandResponse {
  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text:
        `${message}\nExamples: \`/review-latest list type=slack verdict=critical min=15 limit=3\`, \`/review-latest list servicenow 30\`.`,
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
