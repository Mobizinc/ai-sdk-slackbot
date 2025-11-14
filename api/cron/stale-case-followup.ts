import { StaleCaseFollowupService, DEFAULT_ASSIGNMENT_GROUPS } from "../../lib/services/stale-case-followup-service";
import { createSystemContext } from "../../lib/infrastructure/servicenow-context";

const service = new StaleCaseFollowupService();

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function handler(): Promise<Response> {
  createSystemContext("cron-stale-case-followup");

  try {
    const summary = await service.run(DEFAULT_ASSIGNMENT_GROUPS);
    return json({ status: "ok", summary });
  } catch (error) {
    console.error("[Cron: StaleCaseFollowup] Fatal error", error);
    return json({ status: "error", message: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
}

export const GET = handler;
export const POST = handler;
