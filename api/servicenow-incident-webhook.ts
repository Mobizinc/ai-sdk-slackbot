import { ServiceNowIncidentWebhookSchema } from "../lib/schemas/servicenow-incident-webhook";
import { handleIncidentUpdate } from "../lib/services/incident-sync-service";
import { withLangSmithTrace } from "../lib/observability";
import { parseWebhookPayload, authenticateWebhookRequest } from "../lib/utils/webhook-helpers";

const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const USE_NEW_PARSER = process.env.SERVICENOW_USE_NEW_PARSER !== 'false';

const postImpl = withLangSmithTrace(
  async (request: Request) => {
    const rawPayload = await request.text();

    if (!rawPayload) {
      return Response.json({ error: "Empty payload" }, { status: 400 });
    }

    // Authenticate webhook request
    const authResult = authenticateWebhookRequest(request, rawPayload, WEBHOOK_SECRET);
    if (!authResult.authenticated) {
      console.warn('[IncidentWebhook] Authentication failed');
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse payload
    const parseResult = parseWebhookPayload(rawPayload, USE_NEW_PARSER);
    if (!parseResult.success) {
      console.error('[IncidentWebhook] Parsing failed:', parseResult.error?.message);
      return Response.json(
        {
          error: 'Failed to parse payload',
          details: parseResult.error?.message,
          strategy: parseResult.metadata?.strategy,
        },
        { status: 400 }
      );
    }

    // Log parsing metrics for monitoring
    if (parseResult.metadata) {
      console.log('[IncidentWebhook] Parser metrics:', parseResult.metadata);
    }

    // Log warnings for debugging
    if (parseResult.metadata?.warnings && parseResult.metadata.warnings.length > 0) {
      console.warn('[IncidentWebhook] Parser warnings:', parseResult.metadata.warnings);
    }

    let payload = parseResult.data;

    const parsed = ServiceNowIncidentWebhookSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[IncidentWebhook] Payload validation failed", parsed.error);
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }

    try {
      await handleIncidentUpdate(parsed.data);
    } catch (error) {
      console.error("[IncidentWebhook] Failed to process incident update", error);
      return Response.json({ error: "Failed to process incident" }, { status: 500 });
    }

    return Response.json({ status: "ok" });
  },
  {
    name: "servicenow_incident_webhook",
    metadata: {
      source: "servicenow",
      type: "incident_webhook",
    },
  },
);

export const POST = postImpl;
