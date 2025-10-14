import { pullAndStoreCaseQueueSnapshot } from "../../lib/services/case-queue-snapshots";

type JsonBody =
  | { status: "ok"; message: string; snapshotAt: string; rowsPersisted: number }
  | { status: "error"; message: string };

function json(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function runSnapshot(): Promise<Response> {
  try {
    const { snapshotAt, inserted } = await pullAndStoreCaseQueueSnapshot();
    const isoTimestamp = snapshotAt instanceof Date
      ? snapshotAt.toISOString()
      : new Date(snapshotAt).toISOString();

    return json({
      status: "ok",
      message: "Case queue snapshot persisted",
      snapshotAt: isoTimestamp,
      rowsPersisted: inserted,
    });
  } catch (error) {
    console.error("[Cron] Case queue snapshot failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to persist case queue snapshot";
    return json({ status: "error", message }, 500);
  }
}

export async function GET(): Promise<Response> {
  return runSnapshot();
}

export async function POST(): Promise<Response> {
  return runSnapshot();
}
