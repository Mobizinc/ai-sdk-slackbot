/**
 * ServiceNow Orchestration Agent Tool
 *
 * Thin adapter exposing CaseTriageService as an agent tool.
 * Delegates to existing battle-tested orchestration logic.
 *
 * Use when the conversational agent needs to:
 * - Triage a ServiceNow case end-to-end
 * - Fetch case data and perform classification
 * - Execute deterministic actions (similar cases, KB, CMDB, incidents, work notes)
 * - Check for escalation conditions
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { getCaseTriageService } from "../../services/case-triage";
import type { ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import { serviceNowClient } from "../../tools/servicenow";
import { createTriageSystemContext } from "../../services/case-triage/context";

const orchestrationInputSchema = z.object({
  caseNumber: z
    .string()
    .describe("ServiceNow case number (e.g., SCS0001234). Required."),

  mode: z
    .enum(["webhook", "fetch", "manual"])
    .optional()
    .describe(
      "Execution mode: 'webhook' to use provided webhook payload, 'fetch' to retrieve case from ServiceNow, 'manual' to use provided minimal data. Default: 'fetch'"
    ),

  webhookPayload: z
    .any()
    .optional()
    .describe("Full ServiceNow webhook payload (required when mode is 'webhook')"),

  channelId: z
    .string()
    .optional()
    .describe("Slack channel ID for context enrichment"),

  threadTs: z
    .string()
    .optional()
    .describe("Slack thread timestamp for context enrichment"),

  // Manual mode overrides
  shortDescription: z.string().optional().describe("Short description (manual mode)"),
  description: z.string().optional().describe("Full description (manual mode)"),
  priority: z.string().optional().describe("Priority (manual mode)"),
  urgency: z.string().optional().describe("Urgency (manual mode)"),
  state: z.string().optional().describe("State (manual mode)"),
  assignmentGroup: z.string().optional().describe("Assignment group (manual mode)"),
  category: z.string().optional().describe("Category (manual mode)"),
  companyName: z.string().optional().describe("Company name (manual mode)"),
  companySysId: z.string().optional().describe("Company sys_id (manual mode)"),

  // Options
  enableCaching: z.boolean().optional().describe("Enable classification caching. Default: true"),
  writeToServiceNow: z.boolean().optional().describe("Write work notes to ServiceNow. Default: true (auto-disabled for manual mode without sys_id)"),
});

type OrchestrationInput = z.infer<typeof orchestrationInputSchema>;
export type { OrchestrationInput as ServiceNowOrchestrationToolInput };

/**
 * Convert tool input to ServiceNow webhook format
 */
async function buildWebhookPayload(input: OrchestrationInput): Promise<ServiceNowCaseWebhook> {
  const mode = input.mode || "fetch";

  // Mode 1: Webhook - Use provided payload directly
  if (mode === "webhook") {
    if (!input.webhookPayload) {
      throw new Error("webhookPayload is required when mode is 'webhook'");
    }
    return input.webhookPayload;
  }

  // Build Slack routing context (if provided)
  const routingContext = input.channelId || input.threadTs
    ? {
        slack_channel_id: input.channelId,
        slack_thread_ts: input.threadTs,
        invoked_via: "agent_tool",
      }
    : undefined;

  // Mode 2: Fetch - Get case from ServiceNow
  if (mode === "fetch") {
    const snContext = createTriageSystemContext();
    const caseData = await serviceNowClient.getCase(input.caseNumber, snContext);

    if (!caseData) {
      throw new Error(`Case ${input.caseNumber} not found in ServiceNow`);
    }

    // Convert ServiceNowCaseResult to webhook format
    return {
      case_number: caseData.number,
      sys_id: caseData.sys_id,
      short_description: caseData.short_description || "",
      description: caseData.description,
      priority: caseData.priority,
      urgency: caseData.urgency,
      state: caseData.state,
      assignment_group: caseData.assignment_group,
      category: caseData.category,
      subcategory: caseData.subcategory,
      company: caseData.company,
      account_id: caseData.company_name,
      caller_id: caseData.caller_id,
      assigned_to: caseData.assigned_to,
      account: caseData.account, // Fix #4: Use account sys_id, not company_name
      opened_at: caseData.opened_at ? new Date(caseData.opened_at) : undefined,
      updated_at: caseData.opened_at ? new Date(caseData.opened_at) : undefined,
      routing_context: routingContext, // Fix #1: Forward Slack context
    };
  }

  // Mode 3: Manual - Build minimal webhook from provided data
  return {
    case_number: input.caseNumber,
    sys_id: "", // Empty sys_id signals read-only mode
    short_description: input.shortDescription || input.caseNumber,
    description: input.description,
    priority: input.priority,
    urgency: input.urgency,
    state: input.state,
    assignment_group: input.assignmentGroup,
    category: input.category,
    company: input.companySysId,
    account_id: input.companyName,
    account: input.companySysId, // Fix #4: Use sys_id if provided
    routing_context: routingContext, // Fix #1: Forward Slack context
  };
}

export function createServiceNowOrchestrationTool(params: AgentToolFactoryParams) {
  return createTool({
    name: "orchestrate_servicenow_case",
    description:
      "Orchestrates the complete ServiceNow case triage workflow: fetch case data → run Discovery agent → run Classification agent → enrich with similar cases/KB/CMDB → write work notes → create incidents/problems if needed → check escalation. Returns structured results with timing, entities discovered, and Slack-formatted summary.",
    inputSchema: orchestrationInputSchema,
    execute: async (input: OrchestrationInput) => {
      try {
        // Build webhook payload based on mode
        const webhook = await buildWebhookPayload(input);

        // Fix #3: Automatically disable ServiceNow writes for manual mode without sys_id
        const hasValidSysId = webhook.sys_id && webhook.sys_id.length > 0;
        const shouldWriteToServiceNow = hasValidSysId
          ? (input.writeToServiceNow ?? true)
          : false; // Force read-only when sys_id is empty

        // Call existing CaseTriageService (thin adapter)
        const triageService = getCaseTriageService();
        const result = await triageService.triageCase(webhook, {
          enableCaching: input.enableCaching ?? true,
          writeToServiceNow: shouldWriteToServiceNow,
          enableSimilarCases: true,
          enableKBArticles: true,
          enableBusinessContext: true,
          enableWorkflowRouting: true,
          enableCatalogRedirect: true,
          cmdbReconciliationEnabled: true,
          maxRetries: 3,
        });

        // Format result for agent
        return {
          success: true,
          caseNumber: result.caseNumber,
          caseSysId: result.caseSysId,
          workflowId: result.workflowId,

          classification: {
            category: result.classification.category,
            subcategory: result.classification.subcategory,
            confidence: result.classification.confidence_score,
            quick_summary: result.classification.quick_summary,
            immediate_next_steps: result.classification.immediate_next_steps,
            urgency_level: result.classification.urgency_level,
            business_intelligence: result.classification.business_intelligence,
          },

          actions_taken: {
            work_note_written: result.servicenowUpdated,
            incident_created: result.incidentCreated,
            incident_number: result.incidentNumber,
            incident_url: result.incidentUrl,
            problem_created: result.problemCreated,
            problem_number: result.problemNumber,
            catalog_redirected: result.catalogRedirected,
            catalog_items_provided: result.catalogItemsProvided,
          },

          enrichment: {
            similar_cases_found: result.similarCases?.length || 0,
            kb_articles_found: result.kbArticles?.length || 0,
            entities_discovered: result.entitiesDiscovered || 0,
            cmdb_reconciliation: result.cmdbReconciliation,
          },

          metadata: {
            workflow_id: result.workflowId,
            processing_time_ms: result.processingTimeMs,
            cached: result.cached,
            cache_reason: result.cacheReason,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown orchestration error",
          caseNumber: input.caseNumber,
        };
      }
    },
  });
}
