import { z } from "zod";

export const ServiceNowIncidentWebhookSchema = z
  .object({
    incident_number: z.string().describe("Incident number (e.g., INC0012345)"),
    incident_sys_id: z.string().describe("Incident sys_id"),
    sys_id: z.string().optional().describe("Alternate incident sys_id field"),
    parent_case_sys_id: z.string().optional().describe("Parent case sys_id"),
    parent: z.string().optional().describe("Alternate parent case field"),
    state: z.union([z.string(), z.number()]).optional().describe("Incident state value"),
    state_label: z.string().optional().describe("Incident state display label"),
    close_notes: z.string().optional().describe("Incident close notes"),
    close_code: z.string().optional().describe("Incident close code"),
    resolved_at: z.string().optional().describe("Resolution timestamp"),
    work_notes: z.string().optional().describe("Latest work note"),
    comments: z.string().optional().describe("Latest public comment"),
    hold_reason: z.string().optional().describe("Reason incident was placed on hold"),
    hold_until: z.string().optional().describe("Date when hold should end"),
  })
  .passthrough();

export type ServiceNowIncidentWebhook = z.infer<typeof ServiceNowIncidentWebhookSchema>;
