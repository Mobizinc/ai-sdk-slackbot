import { ServiceNowIncidentWebhookSchema, type ServiceNowIncidentWebhook } from "../lib/schemas/servicenow-incident-webhook";
import { handleIncidentUpdate } from "../lib/services/incident-sync-service";
import {
  parseAndValidateWebhookRequest,
  buildErrorResponse,
  type WebhookValidator,
} from "../lib/utils/webhook-helpers";

const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const USE_NEW_PARSER = process.env.SERVICENOW_USE_NEW_PARSER !== 'false';

const incidentValidator: WebhookValidator<ServiceNowIncidentWebhook> = (payload) => {
  const parsed = ServiceNowIncidentWebhookSchema.safeParse(payload);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return {
    success: false,
    errors: parsed.error.errors.map((issue) => issue.message),
    issues: parsed.error.errors,
  };
};

async function postImpl(request: Request) {
  const parsedResult = await parseAndValidateWebhookRequest(request, {
    validator: incidentValidator,
    webhookSecret: WEBHOOK_SECRET,
    useNewParser: USE_NEW_PARSER,
    label: "IncidentWebhook",
  });

  if (!parsedResult.ok) {
    return parsedResult.response;
  }

  try {
    await handleIncidentUpdate(parsedResult.data);
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
