import { z } from "zod";

/**
 * Helper transformer for ServiceNow display_value objects.
 * ServiceNow often sends references as objects with display_value, value, and link fields.
 * This transformer normalizes them to just the display_value (human-readable text).
 */
const displayValueTransformer = z.union([
  z.string(),
  z.object({
    display_value: z.string(),
    value: z.string(),
    link: z.string().optional(),
  }),
  z.object({
    display_value: z.string(),
    value: z.string().optional(),
    link: z.string().optional(),
  }),
]).transform((val) => {
  if (typeof val === 'string') return val;
  return val.display_value || val.value || '';
});

/**
 * Transformer for optional display_value fields.
 * Handles null/undefined values and applies displayValueTransformer.
 */
const optionalDisplayValueTransformer = z.union([
  z.string(),
  z.object({
    display_value: z.string(),
    value: z.string(),
    link: z.string().optional(),
  }),
  z.object({
    display_value: z.string(),
    value: z.string().optional(),
    link: z.string().optional(),
  }),
  z.null(),
  z.undefined(),
]).transform((val) => {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  return val.display_value || val.value || undefined;
}).optional();

export const ServiceNowIncidentWebhookSchema = z
  .object({
    incident_number: z.string().describe("Incident number (e.g., INC0012345)"),
    incident_sys_id: z.string().describe("Incident sys_id"),
    sys_id: z.string().optional().describe("Alternate incident sys_id field"),
    parent_case_sys_id: optionalDisplayValueTransformer.describe("Parent case sys_id"),
    parent: optionalDisplayValueTransformer.describe("Alternate parent case field"),
    state: optionalDisplayValueTransformer.describe("Incident state value"),
    state_label: z.string().optional().describe("Incident state display label"),
    close_notes: z.string().optional().describe("Incident close notes"),
    close_code: optionalDisplayValueTransformer.describe("Incident close code"),
    resolved_at: z.string().optional().describe("Resolution timestamp"),
    work_notes: z.string().optional().describe("Latest work note"),
    comments: z.string().optional().describe("Latest public comment"),
    hold_reason: optionalDisplayValueTransformer.describe("Reason incident was placed on hold"),
    hold_until: z.string().optional().describe("Date when hold should end"),
  })
  .passthrough();

export type ServiceNowIncidentWebhook = z.infer<typeof ServiceNowIncidentWebhookSchema>;
