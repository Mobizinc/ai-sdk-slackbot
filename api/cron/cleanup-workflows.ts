import { cleanupTimedOutGathering } from "../../lib/handle-passive-messages";
import { getContextManager } from "../../lib/context-manager";
import { getCaseClassificationRepository } from "../../lib/db/repositories/case-classification-repository";

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

    const contextManager = getContextManager();
    const { memoryRemoved, dbRemoved } = await contextManager.cleanupOldContexts();

    const classificationRepo = getCaseClassificationRepository();
    const classificationCleanup = await classificationRepo.cleanupOldData();

    const message = [
      "KB gathering cleanup completed",
      `context store trimmed (memory=${memoryRemoved}, db=${dbRemoved})`,
      `classification snapshots purged (inbound=${classificationCleanup.inboundDeleted}, results=${classificationCleanup.resultsDeleted})`,
    ].join("; ");

    return jsonResponse({ status: "ok", message });
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
