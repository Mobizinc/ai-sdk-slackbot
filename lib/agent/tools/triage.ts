/**
 * Triage Tool
 *
 * AI-powered triage and classification for ServiceNow cases.
 */

import { z } from "zod";
import { serviceNowClient } from "../../tools/servicenow";
import { getCaseTriageService } from "../../services/case-triage";
import { createTool, type AgentToolFactoryParams } from "./shared";

export type TriageCaseInput = {
  caseNumber: string;
};

const triageCaseInputSchema = z.object({
  caseNumber: z
    .string()
    .describe("The ServiceNow case number to triage and classify (e.g., 'SCS0001234', 'CS0048851')"),
});

export function createTriageTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    description:
      "Triage and classify a ServiceNow case. Use this when a user explicitly asks to triage, classify, or analyze a case. This performs AI-powered classification including category/subcategory recommendations, technical entity extraction, similar case analysis, and KB article suggestions. Returns comprehensive classification results including confidence scores and immediate next steps.",
    inputSchema: triageCaseInputSchema,
    execute: async ({ caseNumber }: TriageCaseInput) => {
      try {
        updateStatus?.(`is triaging case ${caseNumber}...`);

        if (!caseNumber || caseNumber.trim().length === 0) {
          return {
            error: "Case number is required for triage.",
          };
        }

        if (!serviceNowClient.isConfigured()) {
          return {
            error: "ServiceNow integration is not configured. Cannot fetch case details for triage.",
          };
        }

        const caseDetails = await serviceNowClient.getCase(caseNumber);

        if (!caseDetails) {
          return {
            error: `Case ${caseNumber} not found in ServiceNow. Please verify the case number is correct.`,
          };
        }

        const caseTriageService = getCaseTriageService();

        const triageResult = await caseTriageService.triageCase(
          {
            case_number: caseDetails.number,
            sys_id: caseDetails.sys_id,
            short_description: caseDetails.short_description || "",
            description: caseDetails.description,
            priority: caseDetails.priority,
            urgency: caseDetails.priority,
            state: caseDetails.state,
            category: caseDetails.category,
            subcategory: caseDetails.subcategory,
            assignment_group: caseDetails.assignment_group,
            assignment_group_sys_id: caseDetails.assignment_group,
            assigned_to: caseDetails.assigned_to,
            caller_id: caseDetails.caller_id,
            company: caseDetails.caller_id,
            account_id: undefined,
          },
          {
            enableCaching: true,
            enableSimilarCases: true,
            enableKBArticles: true,
            enableBusinessContext: true,
            enableWorkflowRouting: true,
            writeToServiceNow: false,
          }
        );

        const classification = triageResult.classification;
        const confidencePercent = Math.round((classification.confidence_score || 0) * 100);

        return {
          success: true,
          case_number: triageResult.caseNumber,
          classification: {
            category: classification.category,
            subcategory: classification.subcategory,
            confidence: `${confidencePercent}%`,
            urgency_level: classification.urgency_level,
            quick_summary: classification.quick_summary,
            reasoning: classification.reasoning,
            immediate_next_steps: classification.immediate_next_steps,
            technical_entities: classification.technical_entities,
            keywords: (classification as any).keywords || [],
          },
          similar_cases_found: triageResult.similarCases?.length || 0,
          similar_cases: triageResult.similarCases?.slice(0, 3).map(sc => ({
            case_number: sc.case_number,
            similarity: `${Math.round(sc.similarity_score * 100)}%`,
            summary: sc.short_description?.substring(0, 100),
          })),
          kb_articles_found: triageResult.kbArticles?.length || 0,
          kb_articles: triageResult.kbArticles?.slice(0, 3).map(kb => ({
            number: kb.kb_number,
            title: kb.title?.substring(0, 100),
            relevance: `${Math.round(kb.similarity_score * 10)}%`,
          })),
          processing_time_ms: triageResult.processingTimeMs,
          cached: triageResult.cached,
          record_type_suggestion: triageResult.recordTypeSuggestion,
          message: `Case ${triageResult.caseNumber} triaged successfully. Suggested category: ${classification.category}${classification.subcategory ? ` > ${classification.subcategory}` : ''} (${confidencePercent}% confidence).`,
        };
      } catch (error) {
        console.error("[Triage Case Tool] Error:", error);
        return {
          error: error instanceof Error
            ? error.message
            : "Failed to triage case. Please try again or contact support.",
        };
      }
    },
  });
}
