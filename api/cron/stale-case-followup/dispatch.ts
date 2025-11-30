import { createSystemContext } from "../../../lib/infrastructure/servicenow-context";
import {
  StaleCaseFollowupService,
  DEFAULT_ASSIGNMENT_GROUPS,
  type AssignmentGroupConfig,
} from "../../../lib/services/stale-case-followup-service";
import { getQStashClient, getWorkerUrl, isQStashEnabled } from "../../../lib/queue/qstash-client";

/**
 * Dispatch handler: short-lived.
 * - Fetches stale cases per assignment group
 * - Groups by assignee
 * - Enqueues one QStash job per owner (per group) to avoid Vercel 120s limit
 */

type DispatchBody = {
  groups?: AssignmentGroupConfig[];
};

type DispatchResult = {
  status: "ok";
  enqueued: number;
  qstashEnabled: boolean;
};

const service = new StaleCaseFollowupService(undefined, "dispatch-only");

export async function POST(req: Request): Promise<Response> {
  createSystemContext("cron-stale-case-followup-dispatch");

  const qstashEnabled = isQStashEnabled();
  if (!qstashEnabled) {
    return new Response(
      JSON.stringify({ status: "error", message: "QStash not configured (QSTASH_TOKEN missing)" }),
      { status: 500 },
    );
  }

  let body: DispatchBody | null = null;
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch (error) {
    console.warn("[StaleCaseDispatch] Invalid JSON body", error);
  }

  const groups = Array.isArray(body?.groups) && body!.groups.length > 0
    ? body!.groups
    : DEFAULT_ASSIGNMENT_GROUPS;

  try {
    const tasks = await service.dispatchOwnerJobs(groups, (payload) => enqueueOwnerJob(payload));
    const result: DispatchResult = {
      status: "ok",
      enqueued: tasks,
      qstashEnabled,
    };
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("[StaleCaseDispatch] Fatal error", error);
    return new Response(
      JSON.stringify({ status: "error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 },
    );
  }
}

export const GET = POST; // allow GET for manual trigger (optional)

async function enqueueOwnerJob(payload: any): Promise<void> {
  const client = getQStashClient();
  if (!client) {
    throw new Error("QStash client not initialized");
  }

  const url = getWorkerUrl("/api/cron/stale-case-followup/process-owner");
  await client.publishJSON({
    url,
    body: payload,
  });
}
