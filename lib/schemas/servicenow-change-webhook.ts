/**
 * ServiceNow Change Validation Webhook Schemas
 * Validates inbound change validation requests from ServiceNow
 */

import { z } from "zod";
import {
  displayValueTransformer,
  optionalDisplayValueTransformer,
} from "./servicenow-webhook";

/**
 * Component type enum for validation
 */
export const ComponentTypeEnum = z.enum([
  "catalog_item",
  "ldap_server",
  "mid_server",
  "workflow",
  "std_change_template",  // New: Standard Change Template
  "cmdb_ci"              // New: CMDB Configuration Item
]);

export type ComponentType = z.infer<typeof ComponentTypeEnum>;

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
  component_type: ComponentTypeEnum.describe("Type of component being changed"),
  component_sys_id: z.string().optional().describe("sys_id of the component being changed"),

  // Optional: Template-specific fields
  std_change_producer_version: z.object({
    value: z.string(),
    display_value: z.string().optional(),
  }).optional().describe("Standard change template version details"),

  // Optional: CMDB CI fields
  cmdb_ci: z.object({
    sys_id: z.string(),
    name: optionalDisplayValueTransformer.describe("CMDB CI name"),
    sys_class_name: optionalDisplayValueTransformer.describe("CMDB CI class"),
  }).optional().describe("CMDB Configuration Item details"),

  // Optional: Additional context
  submitted_by: z.string().optional().describe("User who submitted the change"),
  short_description: z.string().optional().describe("Brief change description"),
  description: z.string().optional().describe("Detailed change description"),

  // Optional: Documentation metadata (enhanced)
  business_justification: z.string().optional().describe("Why this change is needed"),
  justification: z.string().optional().describe("Alternative field for business justification"),
  risk_level: z.enum(["low", "medium", "high"]).optional().describe("Risk level of change"),
  implementation_plan: z.string().optional().describe("How change will be implemented"),
  rollback_plan: z.string().optional().describe("Rollback steps if needed"),
  back_out_plan: z.string().optional().describe("Alternative field for rollback plan"),
  test_plan: z.string().optional().describe("Testing strategy"),
  testing_plan: z.string().optional().describe("Alternative field for test plan"),

  // Optional: Schedule information
  start_date: z.coerce.date().optional().describe("Planned start date"),
  end_date: z.coerce.date().optional().describe("Planned end date"),
  maintenance_window: z.string().optional().describe("Maintenance window details"),

  // Optional: Archived payload for fallback
  archived: z.record(z.any()).optional().describe("Archived payload data for fallback"),
});

export type ServiceNowChangeWebhook = z.infer<typeof ServiceNowChangeWebhookSchema>;

/**
 * Validation result schema for Claude synthesis
 */
export const ValidationResultSchema = z.object({
  overall_status: z.enum(["APPROVE", "APPROVE_WITH_CONDITIONS", "REJECT"]).describe("Overall CAB decision"),
  documentation_assessment: z.string().optional().describe("Summary of implementation/rollback/test doc quality"),
  risks: z.array(z.string()).optional().describe("Explicit risks or unknowns"),
  required_actions: z.array(z.string()).optional().describe("Actions needed before CAB approval"),
  synthesis: z.string().optional().describe("Human-readable synthesis of validation results"),
  checks: z.record(z.string(), z.boolean()).optional().describe("Fallback configuration checks (rules mode)"),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Internal change validation request schema
 * Used internally after webhook is received
 */
export const ChangeValidationRequestSchema = z.object({
  changeSysId: z.string(),
  changeNumber: z.string(),
  componentType: ComponentTypeEnum,
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
 * Helper to normalize ServiceNow display/value fields using shared transformers
 */
function toDisplayValue(val: unknown): string | undefined {
  const result = optionalDisplayValueTransformer.safeParse(val);
  return result.success ? result.data : undefined;
}

/**
 * Detect component type and sys_id from payload
 * Priority: Template > CMDB CI > Catalog Item > Others
 */
export function detectComponentType(payload: any): {
  type: ComponentType;
  sysId?: string;
} {
  // Priority 1: Standard Change Template (from version, not catalog)
  if (payload.std_change_producer_version?.value) {
    return {
      type: "std_change_template",
      sysId: payload.std_change_producer_version.value
    };
  }

  // Priority 2: CMDB Configuration Item
  if (payload.cmdb_ci?.sys_id) {
    return {
      type: "cmdb_ci",
      sysId: payload.cmdb_ci.sys_id
    };
  }

  // Priority 3: Catalog Item (existing)
  if (payload.catalog_item?.sys_id || payload.catalog_item) {
    return {
      type: "catalog_item",
      sysId: toDisplayValue(payload.catalog_item?.sys_id || payload.catalog_item)
    };
  }

  // Priority 4: LDAP Server
  if (payload.ldap_server?.sys_id) {
    return {
      type: "ldap_server",
      sysId: toDisplayValue(payload.ldap_server.sys_id)
    };
  }

  // Priority 5: MID Server
  if (payload.mid_server?.sys_id) {
    return {
      type: "mid_server",
      sysId: toDisplayValue(payload.mid_server.sys_id)
    };
  }

  // Priority 6: Workflow
  if (payload.workflow?.sys_id) {
    return {
      type: "workflow",
      sysId: toDisplayValue(payload.workflow.sys_id)
    };
  }

  // Default to catalog_item if component_type is specified but not recognized
  if (payload.component_type) {
    return {
      type: payload.component_type as ComponentType,
      sysId: payload.component_sys_id
    };
  }

  // Final fallback
  return {
    type: "catalog_item",
    sysId: undefined
  };
}

/**
 * Extract documentation fields from payload
 * Handles multiple field name variations and archived data
 */
export function extractDocumentationFields(payload: any): {
  implementation_plan?: string;
  rollback_plan?: string;
  test_plan?: string;
  justification?: string;
} {
  return {
    implementation_plan: toDisplayValue(payload.implementation_plan) ||
                        toDisplayValue(payload.archived?.implementation_plan),
    rollback_plan: toDisplayValue(payload.rollback_plan) ||
                   toDisplayValue(payload.back_out_plan) ||
                   toDisplayValue(payload.archived?.rollback_plan) ||
                   toDisplayValue(payload.archived?.back_out_plan),
    test_plan: toDisplayValue(payload.test_plan) ||
               toDisplayValue(payload.testing_plan) ||
               toDisplayValue(payload.archived?.test_plan) ||
               toDisplayValue(payload.archived?.testing_plan),
    justification: toDisplayValue(payload.justification) ||
                   toDisplayValue(payload.business_justification) ||
                   toDisplayValue(payload.archived?.justification) ||
                   toDisplayValue(payload.archived?.business_justification)
  };
}

/**
 * Normalize a webhook payload
 * Handles various ServiceNow payload formats
 */
export function normalizeChangeWebhook(payload: unknown): ServiceNowChangeWebhook {
  const parsed = ServiceNowChangeWebhookSchema.parse(payload);
  return parsed;
}
