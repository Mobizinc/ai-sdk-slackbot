import { cleanupTimedOutGathering } from "../../lib/handle-passive-messages";

type JsonBody = { status: "ok"; message: string } | { status: "error"; message: string };

function jsonResponse(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function runCleanup(): Promise<Response> {
  try {
    await cleanupTimedOutGathering();
    return jsonResponse({ status: "ok", message: "KB gathering cleanup completed." });
  } catch (error) {
    console.error("[Cron] Cleanup failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ status: "error", message }, 500);
  }
}

export async function GET(): Promise<Response> {
  return runCleanup();
}

export async function POST(): Promise<Response> {
  return runCleanup();
}
