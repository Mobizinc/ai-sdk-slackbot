/**
 * ServiceNow Change Validation Webhook Schemas
 * Validates inbound change validation requests from ServiceNow
 */

import { z } from "zod";

/**
 * ServiceNow Change Validation Webhook Schema
 * Inbound webhook payload when a Standard Change enters "Assess" state
 */
export const ServiceNowChangeWebhookSchema = z.object({
  // Required: Change identification
  change_sys_id: z.string().describe("ServiceNow change request sys_id"),
  change_number: z.string().describe("ServiceNow change number (e.g., CHG0012345)"),
  state: z.string().describe("Current change state (e.g., 'Assess')"),

  // Required: Component being validated
  component_type: z.string().describe("Type of component (catalog_item, ldap_server, mid_server, workflow, etc.)"),
  component_sys_id: z.string().optional().describe("sys_id of the component being changed"),

  // Optional: Additional context
  submitted_by: z.string().optional().describe("User who submitted the change"),
  short_description: z.string().optional().describe("Brief change description"),
  description: z.string().optional().describe("Detailed change description"),

  // Optional: Additional metadata
  business_justification: z.string().optional().describe("Why this change is needed"),
  risk_level: z.enum(["low", "medium", "high"]).optional().describe("Risk level of change"),
  implementation_plan: z.string().optional().describe("How change will be implemented"),
  rollback_plan: z.string().optional().describe("Rollback steps if needed"),
  testing_plan: z.string().optional().describe("Testing strategy"),

  // Optional: Schedule information
  start_date: z.coerce.date().optional().describe("Planned start date"),
  end_date: z.coerce.date().optional().describe("Planned end date"),
  maintenance_window: z.string().optional().describe("Maintenance window details"),
});

export type ServiceNowChangeWebhook = z.infer<typeof ServiceNowChangeWebhookSchema>;

/**
 * Validation result schema for Claude synthesis
 */
export const ValidationResultSchema = z.object({
  overall_status: z.enum(["PASSED", "FAILED", "WARNING"]).describe("Overall validation status"),
  checks: z.record(z.string(), z.boolean()).describe("Individual validation check results"),
  synthesis: z.string().optional().describe("Human-readable synthesis of validation results"),
  remediation_steps: z.array(z.string()).optional().describe("Steps to remediate failures"),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Internal change validation request schema
 * Used internally after webhook is received
 */
export const ChangeValidationRequestSchema = z.object({
  changeSysId: z.string(),
  changeNumber: z.string(),
  componentType: z.string(),
  componentSysId: z.string().optional(),
  payload: z.record(z.any()),
  hmacSignature: z.string().optional(),
  requestedBy: z.string().optional(),
});

export type ChangeValidationRequest = z.infer<typeof ChangeValidationRequestSchema>;

/**
 * Validation error response schema
 */
export const ValidationErrorSchema = z.object({
  error: z.string().describe("Error message"),
  code: z.string().optional().describe("Error code for tracking"),
  details: z.record(z.any()).optional().describe("Additional error context"),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

/**
 * Helper function to extract required fields from webhook payload
 * Handles both ServiceNow's nested object formats and flat strings
 */
function extractValue(val: any): string | undefined {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    return val.display_value || val.value || undefined;
  }
  return undefined;
}

/**
 * Normalize a webhook payload
 * Handles various ServiceNow payload formats
 */
export function normalizeChangeWebhook(payload: unknown): ServiceNowChangeWebhook {
  const parsed = ServiceNowChangeWebhookSchema.parse(payload);
  return parsed;
}
