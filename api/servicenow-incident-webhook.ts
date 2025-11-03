import { ServiceNowIncidentWebhookSchema } from "../lib/schemas/servicenow-incident-webhook";
import { handleIncidentUpdate } from "../lib/services/incident-sync-service";
import { withLangSmithTrace } from "../lib/observability";
import { parseServiceNowPayload } from "../lib/utils/servicenow-payload";
import { ServiceNowParser } from "../lib/utils/servicenow-parser";

const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const USE_NEW_PARSER = process.env.SERVICENOW_USE_NEW_PARSER === 'true';

function isAuthorized(request: Request): boolean {
  if (!WEBHOOK_SECRET) {
    return true;
  }

  const headerToken =
    request.headers.get("x-api-key") || request.headers.get("x-functions-key");
  if (headerToken && headerToken === WEBHOOK_SECRET) {
    return true;
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("code");
  if (queryToken && queryToken === WEBHOOK_SECRET) {
    return true;
  }

  return false;
}

const postImpl = withLangSmithTrace(
  async (request: Request) => {
    if (!isAuthorized(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawPayload = await request.text();

    if (!rawPayload) {
      return Response.json({ error: "Empty payload" }, { status: 400 });
    }

    let payload: unknown;
    try {
      if (USE_NEW_PARSER) {
        // Use new ServiceNowParser with advanced JSON handling
        const parser = new ServiceNowParser();
        const parseResult = parser.parse(rawPayload);
        
        if (!parseResult.success) {
          console.error('[IncidentWebhook] New parser failed:', parseResult.error?.message);
          return Response.json(
            {
              error: 'Failed to parse payload',
              details: parseResult.error?.message,
              strategy: parseResult.strategy,
            },
            { status: 400 }
          );
        }
        
        payload = parseResult.data;
        
        // Log parsing metrics for monitoring
        console.log('[IncidentWebhook] Parser metrics:', parseResult.metadata);
        
        // Log warnings for debugging
        if (parseResult.warnings && parseResult.warnings.length > 0) {
          console.warn('[IncidentWebhook] Parser warnings:', parseResult.warnings);
        }
      } else {
        // Use legacy parser
        payload = parseServiceNowPayload(rawPayload);
      }
    } catch (error) {
      console.error("[IncidentWebhook] Failed to parse JSON payload", error);
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

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
