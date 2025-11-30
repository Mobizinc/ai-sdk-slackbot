import { StaleCaseFollowupService } from "../../../lib/services/stale-case-followup-service";
import { createSystemContext } from "../../../lib/infrastructure/servicenow-context";
import { getSigningKeys, isQStashEnabled, verifyQStashSignature } from "../../../lib/queue/qstash-client";

const service = new StaleCaseFollowupService(undefined, "worker");

export async function POST(request: Request): Promise<Response> {
  createSystemContext("cron-stale-case-followup-worker");

  // Read raw body for signature verification
  const bodyText = await request.text();
  const signature = request.headers.get("upstash-signature");
  const qstashEnabled = isQStashEnabled();

  if (qstashEnabled) {
    const signingKeys = getSigningKeys();
    const isValid = verifyQStashSignature(signature, signingKeys.current || "", bodyText);
    if (!isValid) {
      console.warn("[StaleCaseWorker] Invalid QStash signature - rejecting request");
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(bodyText);
    await service.processOwnerPayload(payload);
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  } catch (error) {
    console.error("[StaleCaseWorker] Failed to process owner payload", error);
    // Return 500 so QStash retries
    return new Response(
      JSON.stringify({ status: "error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 },
    );
  }
}
