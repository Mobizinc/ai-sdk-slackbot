import type { CaseClassificationRequest, ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import type { ServiceNowContext } from "../../infrastructure/servicenow-context";
import { createSystemContext } from "../../infrastructure/servicenow-context";
import { webhookToClassificationRequest } from "../../schemas/servicenow-webhook";

/**
 * Build the deterministic ServiceNow context used during case triage.
 * Ensures feature-flag routing is stable for all webhook-driven operations.
 */
export function createTriageSystemContext(): ServiceNowContext {
  return createSystemContext("servicenow-webhook");
}

/**
 * Normalise the inbound webhook payload into the classifier request shape.
 * Thin wrapper around the shared schema helper so callers do not need to import it directly.
 */
export function buildClassificationRequestFromWebhook(
  webhook: ServiceNowCaseWebhook,
): CaseClassificationRequest {
  return webhookToClassificationRequest(webhook);
}
