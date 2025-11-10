import { ServiceNowIncidentWebhookSchema } from "../lib/schemas/servicenow-incident-webhook";
import { handleIncidentUpdate } from "../lib/services/incident-sync-service";
import {
  parseWebhookPayload,
  authenticateWebhookRequest,
  buildErrorResponse,
} from "../lib/utils/webhook-helpers";

const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const USE_NEW_PARSER = process.env.SERVICENOW_USE_NEW_PARSER !== 'false';

async function postImpl(request: Request) {
  const rawPayload = await request.text();

  if (!rawPayload) {
    return buildErrorResponse({
      type: 'parse_error',
      message: 'Empty payload',
      statusCode: 400,
    });
  }

  // Authenticate webhook request
  const authResult = await authenticateWebhookRequest(request, rawPayload, WEBHOOK_SECRET);
  if (!authResult.authenticated) {
    console.warn('[IncidentWebhook] Authentication failed');
    return buildErrorResponse({
      type: 'authentication_error',
      message: 'Unauthorized',
      statusCode: 401,
    });
  }

  // Parse payload
  const parseResult = parseWebhookPayload(rawPayload, USE_NEW_PARSER);
  if (!parseResult.success) {
    console.error('[IncidentWebhook] Parsing failed:', parseResult.error?.message);
    return buildErrorResponse({
      type: 'parse_error',
      message: parseResult.error?.message || 'Failed to parse payload',
      details: {
        error: parseResult.error?.message,
        strategy: parseResult.metadata?.strategy,
      },
      statusCode: 400,
    });
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
    return buildErrorResponse({
      type: 'validation_error',
      message: 'Invalid payload',
      details: {
        errors: parsed.error.errors.map(e => e.message),
        issues: parsed.error.errors,
      },
      statusCode: 422,
    });
  }

  try {
    await handleIncidentUpdate(parsed.data);
  } catch (error) {
    console.error("[IncidentWebhook] Failed to process incident update", error);
    return buildErrorResponse({
      type: 'internal_error',
      message: 'Failed to process incident',
      statusCode: 500,
    });
  }

  return Response.json({ status: "ok" });
}

export const POST = postImpl;
