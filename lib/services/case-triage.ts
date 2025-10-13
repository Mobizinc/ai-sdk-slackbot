/**
 * Centralized Case Triage Service
 * Orchestrates the complete case classification workflow with caching, routing, and context enrichment
 *
 * This service consolidates triage functionality to be shared by:
 * - ServiceNow webhook (api/servicenow-webhook.ts)
 * - Slack bot passive monitoring (lib/handle-passive-messages.ts)
 * - Any future integrations
 *
 * Original: api/app/routers/webhooks.py:379-531 (servicenow_case_inbound_webhook)
 *
 * Flow:
 * 1. Validate incoming payload
 * 2. Record inbound payload to DB
 * 3. Determine workflow routing
 * 4. Check classification cache
 * 5. If cache miss:
 *    a. Fetch similar cases (Azure AI Search - BM25)
 *    b. Fetch KB articles (vector search)
 *    c. Get business context (company-specific rules)
 *    d. Run LLM classification
 *    e. Extract and store entities
 *    f. Format work note
 *    g. Store classification result
 * 6. Return classification with metadata
 */

import type {
  ServiceNowCaseWebhook,
  CaseClassificationRequest,
  CaseClassificationResult,
  SimilarCaseResult,
  KBArticleResult,
} from "../schemas/servicenow-webhook";
import { getCaseClassificationRepository } from "../db/repositories/case-classification-repository";
import { getWorkflowRouter } from "./workflow-router";
import { getCaseClassifier } from "./case-classifier";
import { createAzureSearchClient } from "./azure-search-client";
import { formatWorkNote } from "./work-note-formatter";
import { getCategorySyncService } from "./servicenow-category-sync";
import type { NewCaseClassificationInbound, NewCaseClassificationResults, NewCaseDiscoveredEntities } from "../db/schema";

export interface CaseTriageOptions {
  /**
   * Enable classification caching
   * If true, checks for existing classification before running LLM
   */
  enableCaching?: boolean;

  /**
   * Enable similar case search
   * If true, fetches similar cases from Azure AI Search for context
   */
  enableSimilarCases?: boolean;

  /**
   * Enable KB article search
   * If true, fetches relevant KB articles for context
   */
  enableKBArticles?: boolean;

  /**
   * Enable business context enrichment
   * If true, enriches prompts with company-specific context
   */
  enableBusinessContext?: boolean;

  /**
   * Enable workflow routing
   * If true, uses WorkflowRouter to determine classification approach
   */
  enableWorkflowRouting?: boolean;

  /**
   * Enable ServiceNow work note writing
   * If true, writes classification results back to ServiceNow
   */
  writeToServiceNow?: boolean;

  /**
   * Max retry attempts for classification
   */
  maxRetries?: number;
}

export interface CaseTriageResult {
  caseNumber: string;
  caseSysId: string;
  workflowId: string;
  classification: CaseClassificationResult;
  similarCases: SimilarCaseResult[];
  kbArticles: KBArticleResult[];
  servicenowUpdated: boolean;
  updateError?: string;
  processingTimeMs: number;
  entitiesDiscovered: number;
  cached: boolean;
  cacheReason?: string;
}

export class CaseTriageService {
  private repository = getCaseClassificationRepository();
  private workflowRouter = getWorkflowRouter();
  private classifier = getCaseClassifier();
  private azureSearchClient = createAzureSearchClient();
  private categorySyncService = getCategorySyncService();

  /**
   * Execute complete case triage workflow
   *
   * Original: api/app/routers/webhooks.py:379-531
   */
  async triageCase(
    webhook: ServiceNowCaseWebhook,
    options: CaseTriageOptions = {}
  ): Promise<CaseTriageResult> {
    const startTime = Date.now();

    // Default options (matching original behavior)
    const {
      enableCaching = true,
      enableSimilarCases = true,
      enableKBArticles = true,
      enableBusinessContext = true,
      enableWorkflowRouting = true,
      writeToServiceNow = process.env.CASE_CLASSIFICATION_WRITE_NOTES === "true",
      maxRetries = parseInt(process.env.CASE_CLASSIFICATION_MAX_RETRIES || "3"),
    } = options;

    console.log(`[Case Triage] Starting triage for case ${webhook.case_number}`);

    try {
      // Step 1: Record inbound payload
      const inboundId = await this.recordInboundPayload(webhook);

      // Step 2: Determine workflow routing
      const workflowDecision = enableWorkflowRouting
        ? this.workflowRouter.determineWorkflow({
            assignmentGroup: webhook.assignment_group,
            category: webhook.category,
            subcategory: webhook.subcategory,
            priority: webhook.priority,
            state: webhook.state,
            caseNumber: webhook.case_number,
            description: webhook.short_description + " " + (webhook.description || ""),
          })
        : { workflowId: "default", ruleMatched: false };

      console.log(
        `[Case Triage] Workflow: ${workflowDecision.workflowId} ` +
          `(rule matched: ${workflowDecision.ruleMatched})`
      );

      // Step 3: Check classification cache
      if (enableCaching) {
        const cachedResult = await this.checkClassificationCache(
          webhook.case_number,
          workflowDecision.workflowId,
          webhook.assignment_group,
          webhook.assignment_group_sys_id
        );

        if (cachedResult) {
          // Mark inbound as processed (using cached result)
          if (inboundId) {
            await this.repository.markPayloadAsProcessed(
              inboundId,
              workflowDecision.workflowId
            );
          }

          const processingTime = Date.now() - startTime;
          console.log(
            `[Case Triage] Using cached classification for ${webhook.case_number} ` +
              `(${processingTime}ms saved)`
          );

          return {
            ...cachedResult,
            cached: true,
            cacheReason: "Existing classification found for case + workflow + assignment group",
            processingTimeMs: processingTime,
          };
        }
      }

      // Step 4: Fetch ServiceNow categories from database cache
      const categoriesData = await this.categorySyncService.getCategoriesForClassifier(
        process.env.SERVICENOW_CASE_TABLE || 'sn_customerservice_case',
        13 // maxAgeHours
      );

      if (categoriesData.isStale) {
        console.warn('[Case Triage] Categories are stale - consider running sync');
      }

      console.log(
        `[Case Triage] Using ${categoriesData.categories.length} categories from ServiceNow cache`
      );

      // Step 5: Convert webhook to classification request
      const classificationRequest = this.webhookToClassificationRequest(webhook);

      // Note: Similar cases and KB articles are fetched by the classifier internally
      // The classifier uses the new Azure Search client with vector search and MSP attribution

      // Step 6: Set real ServiceNow categories in classifier
      this.classifier.setCategories(categoriesData.categories, categoriesData.subcategories);

      // Step 7: Perform classification with retry logic (using real ServiceNow categories)
      let classificationResult: any | null = null;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          classificationResult = await this.classifier.classifyCaseEnhanced({
            case_number: webhook.case_number,
            sys_id: webhook.sys_id,
            short_description: webhook.short_description,
            description: webhook.description,
            assignment_group: webhook.assignment_group,
            urgency: webhook.urgency,
            current_category: webhook.category,
            priority: webhook.priority,
            state: webhook.state,
            company: webhook.company,
            company_name: webhook.account_id, // Use account_id as company_name
          });

          if (classificationResult) {
            console.log(
              `[Case Triage] Classification successful on attempt ${attempt}/${maxRetries}`
            );
            break;
          }
        } catch (error) {
          lastError = error as Error;
          console.warn(
            `[Case Triage] Classification attempt ${attempt}/${maxRetries} failed:`,
            error
          );

          if (attempt < maxRetries) {
            // Exponential backoff
            const backoffMs = Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
        }
      }

      if (!classificationResult) {
        // Mark inbound as failed
        if (inboundId) {
          await this.repository.markPayloadAsProcessed(
            inboundId,
            workflowDecision.workflowId,
            lastError?.message || "Classification failed after retries"
          );
        }

        throw new Error(
          `Classification failed after ${maxRetries} attempts: ${lastError?.message}`
        );
      }

      // Step 9: Format work note
      const workNoteContent = formatWorkNote(classificationResult);

      // Step 10: Write to ServiceNow (if enabled)
      let servicenowUpdated = false;
      let updateError: string | undefined;

      if (writeToServiceNow) {
        try {
          const { serviceNowClient } = await import("../tools/servicenow");
          await serviceNowClient.addCaseWorkNote(webhook.sys_id, workNoteContent);
          servicenowUpdated = true;
          console.log(`[Case Triage] Work note written to ServiceNow for ${webhook.case_number}`);
        } catch (error) {
          updateError = error instanceof Error ? error.message : "Unknown error";
          console.error("[Case Triage] Failed to write work note to ServiceNow:", error);
        }
      }

      // Step 11: Store classification result
      const processingTime = Date.now() - startTime;

      await this.storeClassificationResult({
        caseNumber: webhook.case_number,
        workflowId: workflowDecision.workflowId,
        classification: classificationResult,
        processingTimeMs: processingTime,
        servicenowUpdated,
      });

      // Step 12: Store discovered entities
      const entitiesStored = await this.storeDiscoveredEntities(
        webhook.case_number,
        webhook.sys_id,
        classificationResult
      );

      // Step 13: Mark inbound as processed
      if (inboundId) {
        await this.repository.markPayloadAsProcessed(
          inboundId,
          workflowDecision.workflowId
        );
      }

      console.log(
        `[Case Triage] Completed triage for ${webhook.case_number}: ` +
          `${classificationResult.category || "Unknown"}` +
          `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ""}` +
          ` (${Math.round((classificationResult.confidence_score || 0) * 100)}% confidence) ` +
          `in ${processingTime}ms`
      );

      return {
        caseNumber: webhook.case_number,
        caseSysId: webhook.sys_id,
        workflowId: workflowDecision.workflowId,
        classification: classificationResult,
        similarCases: classificationResult.similar_cases || [],
        kbArticles: classificationResult.kb_articles || [],
        servicenowUpdated,
        updateError,
        processingTimeMs: processingTime,
        entitiesDiscovered: entitiesStored,
        cached: false,
      };
    } catch (error) {
      console.error(`[Case Triage] Failed to triage case ${webhook.case_number}:`, error);
      throw error;
    }
  }

  /**
   * Record inbound webhook payload to database
   *
   * Original: api/app/services/classification_store.py:record_inbound_case
   */
  private async recordInboundPayload(webhook: ServiceNowCaseWebhook): Promise<number | null> {
    try {
      const inboundData: NewCaseClassificationInbound = {
        caseNumber: webhook.case_number,
        caseSysId: webhook.sys_id,
        rawPayload: webhook as any,
        routingContext: {
          assignmentGroup: webhook.assignment_group,
          assignedTo: webhook.assigned_to,
          category: webhook.category,
          subcategory: webhook.subcategory,
          priority: webhook.priority,
          state: webhook.state,
        },
      };

      await this.repository.saveInboundPayload(inboundData);

      // Get the inserted record to return its ID
      const unprocessed = await this.repository.getUnprocessedPayload(webhook.case_number);
      return unprocessed?.id || null;
    } catch (error) {
      console.error("[Case Triage] Failed to record inbound payload:", error);
      return null;
    }
  }

  /**
   * Check if classification exists in cache
   *
   * Cache key: case_number + workflow_id + assignment_group
   * Returns cached result if:
   * - Previous classification exists for same case + workflow
   * - Assignment group hasn't changed (re-routing invalidates cache)
   *
   * Original: api/app/routers/webhooks.py:436-454
   */
  private async checkClassificationCache(
    caseNumber: string,
    workflowId: string,
    assignmentGroup?: string,
    assignmentGroupSysId?: string
  ): Promise<CaseTriageResult | null> {
    try {
      const latestResult = await this.repository.getLatestClassificationResult(caseNumber);

      if (!latestResult) {
        return null;
      }

      // Check if workflow matches
      if (latestResult.workflowId !== workflowId) {
        console.log(
          `[Case Triage] Cache miss - workflow changed: ${latestResult.workflowId} → ${workflowId}`
        );
        return null;
      }

      // Check if assignment group matches (from routing_context)
      const cachedRouting = latestResult.classificationJson as any;
      const cachedAssignmentGroup = cachedRouting.assignment_group;
      const cachedAssignmentGroupSysId = cachedRouting.assignment_group_sys_id;

      if (
        assignmentGroup &&
        cachedAssignmentGroup &&
        cachedAssignmentGroup !== assignmentGroup
      ) {
        console.log(
          `[Case Triage] Cache miss - assignment group changed: ${cachedAssignmentGroup} → ${assignmentGroup}`
        );
        return null;
      }

      if (
        assignmentGroupSysId &&
        cachedAssignmentGroupSysId &&
        cachedAssignmentGroupSysId !== assignmentGroupSysId
      ) {
        console.log(
          `[Case Triage] Cache miss - assignment group sys_id changed: ${cachedAssignmentGroupSysId} → ${assignmentGroupSysId}`
        );
        return null;
      }

      // Cache hit - return cached result
      console.log(
        `[Case Triage] Cache HIT for ${caseNumber} + ${workflowId} (classified at: ${latestResult.createdAt})`
      );

      return {
        caseNumber,
        caseSysId: cachedRouting.sys_id || "",
        workflowId: latestResult.workflowId,
        classification: latestResult.classificationJson as any,
        similarCases: (cachedRouting.similar_cases || []) as SimilarCaseResult[],
        kbArticles: (cachedRouting.kb_articles || []) as KBArticleResult[],
        servicenowUpdated: latestResult.servicenowUpdated,
        processingTimeMs: latestResult.processingTimeMs,
        entitiesDiscovered: latestResult.entitiesCount,
        cached: true,
        cacheReason: "Previous classification found for same case + workflow + assignment",
      };
    } catch (error) {
      console.error("[Case Triage] Error checking cache:", error);
      return null;
    }
  }

  /**
   * Store classification result to database
   *
   * Original: api/app/services/classification_store.py:record_classification_result
   */
  private async storeClassificationResult(data: {
    caseNumber: string;
    workflowId: string;
    classification: any;
    processingTimeMs: number;
    servicenowUpdated: boolean;
  }): Promise<void> {
    try {
      const resultData: NewCaseClassificationResults = {
        caseNumber: data.caseNumber,
        workflowId: data.workflowId,
        classificationJson: data.classification,
        tokenUsage: {
          promptTokens: data.classification.token_usage_input || 0,
          completionTokens: data.classification.token_usage_output || 0,
          totalTokens: data.classification.total_tokens || 0,
        },
        cost: this.calculateCost(data.classification),
        provider: data.classification.llm_provider || "unknown",
        model: data.classification.model_used || "unknown",
        processingTimeMs: data.processingTimeMs,
        servicenowUpdated: data.servicenowUpdated,
        entitiesCount: 0, // Will be updated after entity storage
        similarCasesCount: data.classification.similar_cases_count || 0,
        kbArticlesCount: data.classification.kb_articles_count || 0,
        businessIntelligenceDetected: !!(
          data.classification.business_intelligence?.project_scope_detected ||
          data.classification.business_intelligence?.executive_visibility ||
          data.classification.business_intelligence?.compliance_impact ||
          data.classification.business_intelligence?.financial_impact
        ),
        confidenceScore: data.classification.confidence_score || 0,
        retryCount: 0,
      };

      await this.repository.saveClassificationResult(resultData);

      console.log(`[Case Triage] Stored classification result for ${data.caseNumber}`);
    } catch (error) {
      console.error("[Case Triage] Failed to store classification result:", error);
      // Don't throw - classification succeeded, storage is secondary
    }
  }

  /**
   * Store discovered entities to database
   *
   * Original: api/app/routers/webhooks.py:104-196
   */
  private async storeDiscoveredEntities(
    caseNumber: string,
    caseSysId: string,
    classification: any
  ): Promise<number> {
    if (!classification.technical_entities) {
      return 0;
    }

    try {
      const entities: NewCaseDiscoveredEntities[] = [];

      // Map technical_entities to individual entity records
      const entityTypeMapping: Record<string, string> = {
        ip_addresses: "IP_ADDRESS",
        systems: "SYSTEM",
        users: "USER",
        software: "SOFTWARE",
        error_codes: "ERROR_CODE",
      };

      for (const [entityCategory, entityList] of Object.entries(
        classification.technical_entities
      )) {
        const entityType = entityTypeMapping[entityCategory];
        if (!entityType || !Array.isArray(entityList)) {
          continue;
        }

        for (const entityValue of entityList) {
          entities.push({
            caseNumber,
            caseSysId,
            entityType,
            entityValue: String(entityValue).substring(0, 500), // Truncate to column limit
            confidence: classification.confidence_score || 0.5,
            status: "discovered",
            source: "llm",
            metadata: {},
          });
        }
      }

      if (entities.length === 0) {
        return 0;
      }

      await this.repository.saveDiscoveredEntities(entities);

      const entityTypeCounts = entities.reduce((acc, e) => {
        acc[e.entityType] = (acc[e.entityType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log(
        `[Case Triage] Stored ${entities.length} entities for ${caseNumber}:`,
        entityTypeCounts
      );

      return entities.length;
    } catch (error) {
      console.error("[Case Triage] Failed to store entities:", error);
      return 0;
    }
  }

  /**
   * Calculate cost based on token usage
   *
   * Original: api/app/services/case_classifier.py:1209-1262
   */
  private calculateCost(classification: any): number {
    const promptTokens = classification.token_usage_input || 0;
    const completionTokens = classification.token_usage_output || 0;

    // Simple cost calculation - adjust based on actual pricing
    // These are approximate costs for GPT-4o-mini / Claude Haiku
    const promptCostPer1K = 0.003;
    const completionCostPer1K = 0.004;

    const promptCost = (promptTokens / 1000) * promptCostPer1K;
    const completionCost = (completionTokens / 1000) * completionCostPer1K;

    return promptCost + completionCost;
  }

  /**
   * Convert ServiceNow webhook payload to classification request format
   */
  private webhookToClassificationRequest(
    webhook: ServiceNowCaseWebhook
  ): CaseClassificationRequest {
    return {
      case_number: webhook.case_number,
      sys_id: webhook.sys_id,
      short_description: webhook.short_description,
      description: webhook.description,
      priority: webhook.priority,
      urgency: webhook.urgency,
      current_category: webhook.category,
      company: webhook.company,
      company_name: webhook.account_id, // Use account_id as company_name if available
      assignment_group: webhook.assignment_group,
      assignment_group_sys_id: webhook.assignment_group_sys_id,
      routing_context: webhook.routing_context,
    };
  }

  /**
   * Get triage statistics
   */
  async getTriageStats(days: number = 7): Promise<{
    totalCases: number;
    averageProcessingTime: number;
    averageConfidence: number;
    cacheHitRate: number;
    topWorkflows: Array<{ workflowId: string; count: number }>;
  }> {
    try {
      const stats = await this.repository.getClassificationStats(days);

      // Calculate cache hit rate (approximate)
      // In production, track cache hits separately for accurate calculation
      const cacheHitRate = 0.15; // Placeholder - implement actual tracking

      return {
        totalCases: stats.totalClassifications,
        averageProcessingTime: stats.averageProcessingTime,
        averageConfidence: stats.averageConfidence,
        cacheHitRate,
        topWorkflows: stats.topWorkflows,
      };
    } catch (error) {
      console.error("[Case Triage] Failed to get stats:", error);
      return {
        totalCases: 0,
        averageProcessingTime: 0,
        averageConfidence: 0,
        cacheHitRate: 0,
        topWorkflows: [],
      };
    }
  }

  /**
   * Test triage service connectivity
   */
  async testConnectivity(): Promise<{
    azureSearch: boolean;
    database: boolean;
    serviceNow: boolean;
  }> {
    const results = {
      azureSearch: false,
      database: false,
      serviceNow: false,
    };

    // Test Azure Search
    if (this.azureSearchClient) {
      try {
        const testResult = await this.azureSearchClient.testConnection();
        results.azureSearch = testResult.success;
      } catch (error) {
        console.error("[Case Triage] Azure Search test failed:", error);
      }
    }

    // Test Database
    try {
      await this.repository.getClassificationStats(1);
      results.database = true;
    } catch (error) {
      console.error("[Case Triage] Database test failed:", error);
    }

    // Test ServiceNow
    try {
      const { serviceNowClient } = await import("../tools/servicenow");
      results.serviceNow = serviceNowClient.isConfigured();
    } catch (error) {
      console.error("[Case Triage] ServiceNow test failed:", error);
    }

    return results;
  }
}

// Singleton instance
let triageService: CaseTriageService | null = null;

export function getCaseTriageService(): CaseTriageService {
  if (!triageService) {
    triageService = new CaseTriageService();
  }
  return triageService;
}
