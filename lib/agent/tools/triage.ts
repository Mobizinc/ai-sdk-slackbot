/**
 * Triage Tool
 *
 * AI-powered triage and classification for ServiceNow cases.
 */

import { z } from "zod";
import { serviceNowClient } from "@/tools/servicenow";
import { getCaseTriageService } from "@/services/case-triage";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { createServiceNowContext } from "@/infrastructure/servicenow-context";
import { optimizeImageForClaude, isSupportedImageFormat } from "@/utils/image-processing";
import type { ContentBlock } from "@/services/anthropic-chat";
import { getEnableMultimodalToolResults, getMaxImageAttachmentsPerTool, getMaxImageSizeBytes } from "@/config/helpers";

export type TriageCaseInput = {
  caseNumber: string;
  includeScreenshots?: boolean;
};

const triageCaseInputSchema = z.object({
  caseNumber: z
    .string()
    .describe("The ServiceNow case number to triage and classify (e.g., 'SCS0001234', 'CS0048851')"),
  includeScreenshots: z
    .boolean()
    .optional()
    .describe("Include screenshots/attachments for visual analysis during triage. Increases token usage (3000-10000 tokens) but provides richer context for UI errors, error screenshots, and system state analysis. Only use when visual information is critical for classification."),
});

export function createTriageTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "triage_case",
    description:
      "Performs comprehensive AI-powered triage and classification analysis of a ServiceNow case to help determine priority, category, assignment, and resolution strategy. This tool fetches full case details from ServiceNow and applies machine learning to recommend: appropriate category and subcategory classifications with confidence scores, urgency/priority levels, optimal assignment group routing, extracted technical entities (systems, technologies, error codes), similar historical cases for pattern recognition, and relevant KB articles for faster resolution. Use this tool when a user explicitly asks to 'triage', 'classify', 'analyze', or 'categorize' a specific case number. Set includeScreenshots to true to fetch and analyze image attachments (error screenshots, UI issues, system state) alongside the case description. Visual analysis can significantly improve classification accuracy for UI/UX issues, error messages captured in screenshots, and system monitoring alerts. WARNING: Screenshots increase token consumption by 3000-10000 tokens per case depending on attachment count and size. The tool returns structured classification results with confidence percentages, similar case matches ranked by relevance, actionable next steps, potential KB article references, and optionally the case's screenshot attachments for visual context. This is a read-only analytical tool that does not modify the case in ServiceNow - it only provides triage recommendations. Requires ServiceNow integration to be configured and a valid case number.",
    inputSchema: triageCaseInputSchema,
    execute: async ({ caseNumber, includeScreenshots }: TriageCaseInput) => {
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

        // Create ServiceNow context for deterministic feature flag routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        const caseDetails = await serviceNowClient.getCase(caseNumber, snContext);

        if (!caseDetails) {
          return {
            error: `Case ${caseNumber} not found in ServiceNow. Please verify the case number is correct.`,
          };
        }

        const caseTriageService = getCaseTriageService();

        const classificationStage = await caseTriageService.runClassificationStage(
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

        const triageResult = {
          caseNumber: classificationStage.core.caseNumber,
          classification: classificationStage.core.classification,
          similarCases: classificationStage.core.similarCases,
          kbArticles: classificationStage.core.kbArticles,
          processingTimeMs: classificationStage.core.processingTimeMs,
          cached: classificationStage.core.cached,
          recordTypeSuggestion: classificationStage.core.recordTypeSuggestion,
        };

        const classification = triageResult.classification;
        const confidencePercent = Math.round((classification.confidence_score || 0) * 100);

        const result = {
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

        // Handle screenshots if requested
        if (includeScreenshots && getEnableMultimodalToolResults()) {
          try {
            updateStatus?.(`is fetching screenshots for ${caseNumber}...`);

            const attachments = await serviceNowClient.getAttachments(
              "sn_customerservice_case",
              caseDetails.sys_id,
              getMaxImageAttachmentsPerTool()
            );

            const imageAttachments = attachments.filter(a =>
              isSupportedImageFormat(a.content_type)
            );

            if (imageAttachments.length > 0) {
              const imageBlocks: ContentBlock[] = [];

              for (const attachment of imageAttachments.slice(0, 3)) {
                try {
                  const imageBuffer = await serviceNowClient.downloadAttachment(attachment.sys_id);
                  const optimized = await optimizeImageForClaude(
                    imageBuffer,
                    attachment.content_type,
                    getMaxImageSizeBytes()
                  );

                  imageBlocks.push({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: optimized.media_type,
                      data: optimized.data,
                    },
                  });
                } catch (error) {
                  console.error(`[Triage] Failed to process ${attachment.file_name}:`, error);
                }
              }

              if (imageBlocks.length > 0) {
                return {
                  ...result,
                  _attachmentBlocks: imageBlocks,
                  _attachmentCount: imageBlocks.length,
                };
              }
            }
          } catch (error) {
            console.error("[Triage] Failed to fetch screenshots:", error);
            // Continue without screenshots, don't fail triage
          }
        }

        return result;
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
