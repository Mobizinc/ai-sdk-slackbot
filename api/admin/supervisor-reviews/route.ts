import { authorizeAdminRequest, getCorsHeaders } from "../utils";
import { getInteractiveStateManager, type SupervisorReviewStatePayload } from "../../../lib/services/interactive-state-manager";
import {
  approveSupervisorState,
  rejectSupervisorState,
  SupervisorStateNotFoundError,
} from "../../../lib/supervisor/actions";

const stateManager = getInteractiveStateManager();

export async function GET(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawTypeFilter = searchParams.get("type");
    const typeFilter = normalizeArtifactType(rawTypeFilter);
    const verdictFilter = searchParams.get("verdict") as
      | "pass"
      | "revise"
      | "critical"
      | null;
    const minAgeMinutes = Number(searchParams.get("minAgeMinutes")) || 0;
    const limit = Math.min(Number(searchParams.get("limit")) || 25, 100);

    const states = await stateManager.getPendingStatesByType("supervisor_review");
    const now = Date.now();

    const filtered = states
      .filter((state) => {
        if (typeFilter && state.payload.artifactType !== typeFilter) {
          return false;
        }
        if (verdictFilter && state.payload.llmReview?.verdict !== verdictFilter) {
          return false;
        }
        if (minAgeMinutes > 0) {
          const ageMinutes =
            (now - new Date(state.payload.blockedAt).getTime()) / (60 * 1000);
          if (ageMinutes < minAgeMinutes) {
            return false;
          }
        }
        return true;
      })
      .slice(0, limit);

    const stats = buildStats(states, now);

    const payload = {
      total: filtered.length,
      stats,
      filters: {
        type: rawTypeFilter || "all",
        verdict: verdictFilter || "all",
        minAgeMinutes,
      },
      items: filtered.map((state) => mapState(state, now)),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  } catch (error) {
    console.error("[Admin] Failed to list supervisor reviews:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  }
}

export async function POST(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = await request.json();
    const action = body?.action as "approve" | "reject";
    const stateId = body?.stateId as string;
    const reviewer = body?.reviewer || "admin-ui";

    if (!action || !stateId) {
      return new Response(JSON.stringify({ error: "action and stateId are required" }), {
        status: 400,
        headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
      });
    }

    let state;
    if (action === "approve") {
      state = await approveSupervisorState(stateId, reviewer);
    } else if (action === "reject") {
      state = await rejectSupervisorState(stateId, reviewer);
    } else {
      return new Response(JSON.stringify({ error: "Unsupported action" }), {
        status: 400,
        headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: action === "approve" ? "approved" : "rejected",
        item: mapState(state, Date.now()),
      }),
      {
        status: 200,
        headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
      }
    );
  } catch (error) {
    if (error instanceof SupervisorStateNotFoundError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
      });
    }

    console.error("[Admin] Failed to update supervisor review:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
  });
}

function mapState(state: any, now: number) {
  const payload: SupervisorReviewStatePayload = state.payload;
  const ageMinutes = Math.round(
    (now - new Date(payload.blockedAt).getTime()) / (60 * 1000)
  );

  return {
    id: state.id,
    artifactType: payload.artifactType,
    caseNumber: payload.caseNumber,
    reason: payload.reason,
    blockedAt: payload.blockedAt,
    ageMinutes,
    channelId: payload.channelId,
    threadTs: payload.threadTs,
    verdict: payload.llmReview?.verdict ?? null,
    llmReview: payload.llmReview ?? null,
    metadata: payload.metadata ?? {},
    status: state.status,
  };
}

function buildStats(states: any[], now: number) {
  const sums = {
    totalPending: states.length,
    averageAgeMinutes: 0,
    byType: {
      slack_message: 0,
      servicenow_work_note: 0,
    },
    byVerdict: {
      pass: 0,
      revise: 0,
      critical: 0,
      unknown: 0,
    },
  };

  for (const state of states) {
    const payload: SupervisorReviewStatePayload = state.payload;
    const ageMinutes =
      (now - new Date(payload.blockedAt).getTime()) / (60 * 1000);
    sums.averageAgeMinutes += ageMinutes;

    if (payload.artifactType === "slack_message") {
      sums.byType.slack_message += 1;
    } else {
      sums.byType.servicenow_work_note += 1;
    }

    const verdict = payload.llmReview?.verdict ?? "unknown";
    if (verdict in sums.byVerdict) {
      (sums.byVerdict as any)[verdict] += 1;
    } else {
      sums.byVerdict.unknown += 1;
    }
  }

  if (sums.totalPending > 0) {
    sums.averageAgeMinutes = Math.round(
      sums.averageAgeMinutes / sums.totalPending
    );
  }

  return sums;
}

function normalizeArtifactType(
  value: string | null
): "slack_message" | "servicenow_work_note" | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === "slack" || normalized === "slack_message") {
    return "slack_message";
  }
  if (
    normalized === "servicenow" ||
    normalized === "service_now" ||
    normalized === "sn" ||
    normalized === "servicenow_work_note" ||
    normalized === "work_note"
  ) {
    return "servicenow_work_note";
  }

  return null;
}
