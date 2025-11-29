import { authorizeAdminRequest, getCorsHeaders } from "../utils";
import {
  StaleCaseFollowupService,
  DEFAULT_ASSIGNMENT_GROUPS,
  getStaleCaseFollowupSummary,
  type AssignmentGroupConfig,
  type FollowupRunSummary,
} from "../../../lib/services/stale-case-followup-service";

const followupService = new StaleCaseFollowupService();

type SummaryResponse = {
  status: "ok";
  summary: FollowupRunSummary | null;
};

type TriggerResponse = {
  status: "ok";
  summary: FollowupRunSummary;
};

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const summary = await getStaleCaseFollowupSummary();
    const body: SummaryResponse = { status: "ok", summary };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  } catch (error) {
    console.error("[Admin] Failed to fetch follow-up summary", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), {
      status: 500,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  let payload: { groups?: AssignmentGroupConfig[] } | null = null;
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      payload = await request.json();
    }
  } catch (error) {
    console.warn("[Admin] Invalid JSON for follow-up trigger", error);
    return new Response(JSON.stringify({ status: "error", message: "Invalid JSON" }), {
      status: 400,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  }

  try {
    const groups = Array.isArray(payload?.groups) && payload!.groups.length > 0
      ? payload!.groups
      : DEFAULT_ASSIGNMENT_GROUPS;
    const summary = await followupService.run(groups);
    const body: TriggerResponse = { status: "ok", summary };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  } catch (error) {
    console.error("[Admin] Failed to run follow-up job", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server error" }), {
      status: 500,
      headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
    });
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, "GET,POST,OPTIONS"),
  });
}
