/**
 * ServiceNow Change Validation Webhook Endpoint
 * Handles incoming change validation requests from ServiceNow
 *
 * When a Standard Change enters "Assess" state, ServiceNow posts a webhook.
 * This endpoint receives it, validates, stores it in DB, and queues it for async processing.
 *
 * Features:
 * - HMAC signature verification
 * - Zod schema validation
 * - Database persistence
 * - Async processing via QStash
 * - LangSmith tracing
 */

import { getChangeValidationService } from "../lib/services/change-validation";
import { getQStashClient, getWorkerUrl, isQStashEnabled } from "../lib/queue/qstash-client";
import { withLangSmithTrace } from "../lib/observability";
import { ServiceNowChangeWebhookSchema } from "../lib/schemas/servicenow-change-webhook";
import { authenticateWebhookRequest, buildErrorResponse } from "../lib/utils/webhook-helpers";
import { ServiceNowParser } from "../lib/utils/servicenow-parser";

// Initialize services
const changeValidationService = getChangeValidationService();
const serviceNowParser = new ServiceNowParser();

// Configuration
const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const ENABLE_CHANGE_VALIDATION = process.env.ENABLE_CHANGE_VALIDATION !== "false";
const ENABLE_ASYNC_PROCESSING = process.env.ENABLE_ASYNC_PROCESSING !== "false";

// Validate required configuration at startup
if (!WEBHOOK_SECRET && process.env.NODE_ENV === "production") {
  console.error("[Change Webhook] SERVICENOW_WEBHOOK_SECRET must be configured in production");
}

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Try to enqueue change validation for async processing
 */
async function tryEnqueueValidation(
  changeSysId: string,
  changeNumber: string
): Promise<boolean> {
  if (!ENABLE_ASYNC_PROCESSING || !isQStashEnabled()) {
    return false;
  }

  try {
    const qstashClient = getQStashClient();
    if (!qstashClient) {
      console.warn("[Change Webhook] QStash client not initialized");
      return false;
    }

    const workerUrl = getWorkerUrl("/api/workers/process-change-validation");
    console.log(`[Change Webhook] Enqueueing change ${changeNumber} to ${workerUrl}`);

    await qstashClient.publishJSON({
      url: workerUrl,
      body: {
        changeSysId,
        changeNumber,
      },
      retries: 3,
      delay: 0,
    });

    console.log(`[Change Webhook] Change ${changeNumber} queued successfully`);
    return true;
  } catch (error) {
    console.error("[Change Webhook] Failed to enqueue to QStash:", error);
    return false;
  }
}

/**
 * Main webhook handler
 */
const postImpl = withLangSmithTrace(
  async (request: Request) => {
    const startTime = Date.now();

    try {
      // Check if validation is enabled
      if (!ENABLE_CHANGE_VALIDATION) {
        console.warn("[Change Webhook] Change validation is disabled");
        return buildErrorResponse({
          type: "internal_error",
          message: "Change validation is currently disabled",
          statusCode: 503,
        });
      }

      // Read request body once
      const payload = await request.text();

      // Verify authentication using edge-compatible helper
      const authResult = await authenticateWebhookRequest(request, payload, WEBHOOK_SECRET);
      if (!authResult.authenticated) {
        console.warn("[Change Webhook] Authentication failed:", authResult.error);
        return buildErrorResponse({
          type: "authentication_error",
          message: "Unauthorized - invalid or missing credentials",
          details: { method_attempted: authResult.method },
          statusCode: 401,
        });
      }

      console.log(`[Change Webhook] Authenticated via ${authResult.method}`);

      // Parse JSON payload using resilient parser
      const parsed = serviceNowParser.parse(payload);
      if (!parsed.success || !parsed.data) {
        console.error("[Change Webhook] Failed to parse ServiceNow payload:", parsed.error);
        return buildErrorResponse({
          type: "parse_error",
          message: "Invalid ServiceNow payload",
          details: {
            error: parsed.error instanceof Error ? parsed.error.message : String(parsed.error),
            strategy: parsed.strategy,
          },
          statusCode: 400,
        });
      }

      if (parsed.warnings && parsed.warnings.length > 0) {
        console.warn("[Change Webhook] Parser warnings:", parsed.warnings);
      }

      const webhookData = parsed.data;

      // Validate schema
      let validated;
      try {
        validated = ServiceNowChangeWebhookSchema.parse(webhookData);
      } catch (error) {
        console.error("[Change Webhook] Schema validation failed:", error);
        return buildErrorResponse({
          type: "validation_error",
          message: "Invalid webhook payload schema",
          details: { error: error instanceof Error ? error.message : String(error) },
          statusCode: 422,
        });
      }

      console.log(`[Change Webhook] Received change ${validated.change_number} (${validated.change_sys_id})`);

      // Extract auth info - capture actual signature header for audit trail
      const requestedBy = request.headers.get("x-servicenow-user") || validated.submitted_by;
      const hmacSignature = request.headers.get("x-servicenow-signature") || request.headers.get("signature");

      // Store in database with actual signature value (not just auth method)
      const dbRecord = await changeValidationService.receiveWebhook(
        validated,
        hmacSignature || undefined,
        requestedBy || undefined
      );

      // Try to enqueue for async processing
      const queued = await tryEnqueueValidation(validated.change_sys_id, validated.change_number);

      // Return response
      const duration = Date.now() - startTime;
      const response = {
        status: "accepted",
        change_number: validated.change_number,
        change_sys_id: validated.change_sys_id,
        message: queued
          ? "Change validation queued for processing"
          : "Change validation received (sync processing)",
        request_id: dbRecord.id,
        processing_mode: queued ? "async" : "sync",
        duration_ms: duration,
      };

      console.log(`[Change Webhook] Returning 202 Accepted for ${validated.change_number}`);

      return Response.json(response, { status: 202 });
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error("[Change Webhook] Unexpected error:", error);

      return buildErrorResponse({
        type: "internal_error",
        message: error instanceof Error ? error.message : "Internal server error",
        details: { duration_ms: duration },
        statusCode: 500,
      });
    }
  },
  {
    name: "servicenow-change-webhook",
    tags: {
      component: "api",
      operation: "webhook",
      service: "servicenow",
      feature: "change-validation",
      runtime: "edge"
    },
    metadata: {
      runtime: "edge",
      version: "1.0.0",
    },
  }
);

export const POST = postImpl;
