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

import type { ServiceNowCaseWebhook } from "../schemas/servicenow-webhook";
import { getCaseClassificationRepository } from "../db/repositories/case-classification-repository";
import { getWorkflowRouter } from "./workflow-router";
import { getCaseClassifier } from "./case-classifier";
import { getCategorySyncService } from "./servicenow-category-sync";
import { getCmdbReconciliationService } from "./cmdb-reconciliation";
import { getCatalogRedirectHandler } from "./catalog-redirect-handler";
import { getEscalationService } from "./escalation-service";
import { config } from "../config";

// Import from extracted modules
import type { CaseTriageOptions, CaseTriageResult } from "./case-triage/types";
import { TriageStorage } from "./case-triage/storage";
import { TriageCache } from "./case-triage/cache";
import { enrichClassificationContext } from "./case-triage/retrieval";
import { handleRecordTypeSuggestion } from "./case-triage/incident-handler";
import { formatWorkNote } from "./case-triage/formatters";
import { getClassificationConfig, IDEMPOTENCY_WINDOW_MINUTES } from "./case-triage/constants";
import { createTriageSystemContext } from "./case-triage/context";

// Re-export types for backward compatibility
export type { CaseTriageOptions, CaseTriageResult } from "./case-triage/types";
export { TriageStorage, TriageCache };

export class CaseTriageService {
  private repository = getCaseClassificationRepository();
  private workflowRouter = getWorkflowRouter();
  private classifier = getCaseClassifier();
  private categorySyncService = getCategorySyncService();
  private catalogRedirectHandler = getCatalogRedirectHandler();
  private cmdbReconciliationService = getCmdbReconciliationService();


  // Module instances
  private storage = new TriageStorage(this.repository);
  private cache = new TriageCache(this.repository);

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

    // Create ServiceNow context for system operation (deterministic routing)
    const snContext = createTriageSystemContext();

    // Get full configuration with defaults
    const fullConfig = getClassificationConfig(options, config);

    console.log(`[Case Triage] Starting triage for case ${webhook.case_number}`);

    try {
      // Step 0: Idempotency check - return existing result if processed recently
      // This prevents duplicate work if QStash retries after partial success
      if (fullConfig.enableCaching) {
        const idempotencyResult = await this.cache.checkIdempotency(
          webhook.case_number,
          IDEMPOTENCY_WINDOW_MINUTES
        );

        if (idempotencyResult.hit) {
          const processingTime = Date.now() - startTime;
          console.log(
            `[Case Triage] Idempotency HIT for ${webhook.case_number} - ` +
            `returning cached result (${processingTime}ms)`
          );

          return {
            ...idempotencyResult.data!,
            processingTimeMs: processingTime,
          };
        }
      }

      // Step 1: Record inbound payload
      const inboundId = await this.storage.recordInbound(webhook);

      // Step 2: Determine workflow routing
      const workflowDecision = fullConfig.enableWorkflowRouting
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

      // Step 3: Check workflow cache
      if (fullConfig.enableCaching) {
        const cacheResult = await this.cache.checkWorkflowCache({
          caseNumber: webhook.case_number,
          workflowId: workflowDecision.workflowId,
          assignmentGroup: webhook.assignment_group || null,
        });

        if (cacheResult.hit) {
          // Mark inbound as processed (using cached result)
          if (inboundId) {
            await this.repository.markPayloadAsProcessed(
              inboundId,
              workflowDecision.workflowId
            );
          }

          const processingTime = Date.now() - startTime;
          console.log(
            `[Case Triage] Workflow cache HIT for ${webhook.case_number} - ` +
              `returning cached result (${processingTime}ms)`
          );

          return {
            ...cacheResult.data!,
            processingTimeMs: processingTime,
          };
        }
      }

      // Step 4-6: Enrich classification context (categories + application services)
      const enrichment = await enrichClassificationContext(
        webhook,
        this.categorySyncService,
        snContext
      );

      // Set categories in classifier (supports dual categorization for Incident creation)
      this.classifier.setCategories(
        enrichment.categories.data.caseCategories,
        enrichment.categories.data.incidentCategories,
        enrichment.categories.data.caseSubcategories,
        enrichment.categories.data.incidentSubcategories
      );

      // Set application services if found
      if (enrichment.applicationServices.length > 0) {
        this.classifier.setApplicationServices(enrichment.applicationServices);
      }

      // Step 7: Perform classification with retry logic (using real ServiceNow categories)
      const classificationStart = Date.now();
      let classificationResult: any | null = null;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= fullConfig.maxRetries; attempt++) {
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
              `[Case Triage] Classification successful on attempt ${attempt}/${fullConfig.maxRetries}`
            );
            break;
          }
        } catch (error) {
          lastError = error as Error;
          console.warn(
            `[Case Triage] Classification attempt ${attempt}/${fullConfig.maxRetries} failed:`,
            error
          );

          if (attempt < fullConfig.maxRetries) {
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
          `Classification failed after ${fullConfig.maxRetries} attempts: ${lastError?.message}`
        );
      }

      const classificationTime = Date.now() - classificationStart;

      // Step 9: Format work note
      const workNoteContent = formatWorkNote(classificationResult);

      // Step 10: Write to ServiceNow (if enabled)
      let servicenowUpdated = false;
      let updateError: string | undefined;

      if (fullConfig.writeToServiceNow) {
        try {
          const { serviceNowClient } = await import("../tools/servicenow");
          await serviceNowClient.addCaseWorkNote(webhook.sys_id, workNoteContent, true, snContext);
          servicenowUpdated = true;
          console.log(`[Case Triage] Work note written to ServiceNow for ${webhook.case_number}`);
        } catch (error) {
          updateError = error instanceof Error ? error.message : "Unknown error";
          console.error("[Case Triage] Failed to write work note to ServiceNow:", error);
        }
      }

      // Step 11: Store classification result
      const processingTime = Date.now() - startTime;

      await this.storage.saveClassification({
        caseNumber: webhook.case_number,
        workflowId: workflowDecision.workflowId,
        classification: classificationResult,
        processingTimeMs: processingTime,
        servicenowUpdated,
      });

      // Step 12: Store discovered entities
      const entitiesStored = await this.storage.saveEntities(
        webhook.case_number,
        webhook.sys_id,
        classificationResult
      );

      // Step 12.5: CMDB Reconciliation (if enabled)
      let cmdbReconciliationResults = null;
      if (fullConfig.cmdbReconciliationEnabled) {
        try {
          cmdbReconciliationResults = await this.cmdbReconciliationService.reconcileEntities({
            caseNumber: webhook.case_number,
            caseSysId: webhook.sys_id,
            entities: classificationResult.technical_entities || {
              ip_addresses: [],
              systems: [],
              users: [],
              software: [],
              error_codes: [],
              network_devices: [],
            },
          });
          console.log(`[Case Triage] CMDB reconciliation completed for ${webhook.case_number}:`, {
            total: cmdbReconciliationResults.totalEntities,
            matched: cmdbReconciliationResults.matched,
            unmatched: cmdbReconciliationResults.unmatched,
            skipped: cmdbReconciliationResults.skipped,
          });
        } catch (error) {
          console.error(`[Case Triage] CMDB reconciliation failed for ${webhook.case_number}:`, error);
          // Don't fail the entire triage process, just log the error
        }
      }

      // Step 13: Check record type suggestion and auto-create Incident/Problem if needed
      let incidentCreated = false;
      let incidentNumber: string | undefined;
      let incidentSysId: string | undefined;
      let incidentUrl: string | undefined;
      let problemCreated = false;
      let problemNumber: string | undefined;
      let problemSysId: string | undefined;
      let problemUrl: string | undefined;

      const incidentHandling = await handleRecordTypeSuggestion({
        suggestion: classificationResult.record_type_suggestion,
        classificationResult,
        webhook,
        snContext,
      });

      if (incidentHandling.incidentCreated) {
        incidentCreated = true;
        incidentNumber = incidentHandling.incidentNumber;
        incidentSysId = incidentHandling.incidentSysId;
        incidentUrl = incidentHandling.incidentUrl;
      }

      if (incidentHandling.problemCreated) {
        problemCreated = true;
        problemNumber = incidentHandling.problemNumber;
        problemSysId = incidentHandling.problemSysId;
        problemUrl = incidentHandling.problemUrl;
      }

      // Step 14: Check for catalog redirect (HR requests submitted incorrectly)
      let catalogRedirected = false;
      let catalogRedirectReason: string | undefined;
      let catalogItemsProvided = 0;

      if (fullConfig.enableCatalogRedirect && !incidentCreated && !problemCreated) {
        try {
          console.log(`[Case Triage] Checking catalog redirect for ${webhook.case_number}`);

          const redirectResult = await this.catalogRedirectHandler.processCase({
            caseNumber: webhook.case_number,
            caseSysId: webhook.sys_id,
            shortDescription: webhook.short_description,
            description: webhook.description,
            category: classificationResult.category,
            subcategory: classificationResult.subcategory,
            companyId: webhook.company,
            submittedBy: webhook.caller_id,
            clientName: webhook.account_id, // Use account_id as client name
          });

          if (redirectResult.redirected) {
            catalogRedirected = true;
            catalogItemsProvided = redirectResult.catalogItems.length;
            catalogRedirectReason =
              `HR request detected and redirected to catalog. ` +
              `${redirectResult.caseClosed ? "Case automatically closed." : "Work note added."}`;

            console.log(
              `[Case Triage] Catalog redirect successful for ${webhook.case_number}: ` +
                `${catalogItemsProvided} catalog items provided, ` +
                `case closed: ${redirectResult.caseClosed}`
            );
          }
        } catch (error) {
          console.error(`[Case Triage] Catalog redirect failed for ${webhook.case_number}:`, error);
          // Don't fail the entire triage - log error but continue
        }
      }

      // Step 15: Mark inbound as processed
      if (inboundId) {
        await this.repository.markPayloadAsProcessed(
          inboundId,
          workflowDecision.workflowId
        );
      }

      // Step 16: Check for business intelligence escalation (non-BAU cases)
      if (classificationResult.business_intelligence) {
        try {
          const { getEscalationService } = await import('./escalation-service');
          const escalationService = getEscalationService();

          await escalationService.checkAndEscalate({
            caseNumber: webhook.case_number,
            caseSysId: webhook.sys_id,
            classification: classificationResult,
            caseData: {
              short_description: webhook.short_description,
              description: webhook.description,
              priority: webhook.priority,
              urgency: webhook.urgency,
              state: webhook.state,
            },
            assignedTo: webhook.assigned_to,
            assignmentGroup: webhook.assignment_group,
            // Use account_id for human-readable client name (fallback to account field if account_id not present)
            companyName: webhook.account_id || webhook.account,
            // Include caller/requester information
            contactName: webhook.caller_id,
          });

          console.log(`[Case Triage] Escalation check completed for ${webhook.case_number}`);
        } catch (error) {
          console.error(`[Case Triage] Escalation failed for ${webhook.case_number}:`, error);
          // Don't fail the entire triage - log error but continue
        }
      }

      // Log timing breakdown for performance analysis
      const retrievalTime = enrichment.categories.fetchTimeMs + enrichment.applicationsFetchTimeMs;
      const storageTime = Date.now() - startTime - classificationTime - retrievalTime;
      console.log(
        `[Case Triage] Timing breakdown: ` +
        `retrieval=${retrievalTime}ms, classification=${classificationTime}ms, ` +
        `storage/updates=${storageTime}ms, total=${processingTime}ms`
      );

      console.log(
        `[Case Triage] Completed triage for ${webhook.case_number}: ` +
          `${classificationResult.category || "Unknown"}` +
          `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ""}` +
          ` (${Math.round((classificationResult.confidence_score || 0) * 100)}% confidence) ` +
          `in ${processingTime}ms` +
          `${incidentCreated ? ` | Incident ${incidentNumber} created` : ''}` +
          `${problemCreated ? ` | Problem ${problemNumber} created` : ''}` +
          `${catalogRedirected ? ` | Redirected to catalog (${catalogItemsProvided} items)` : ''}`
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
        cmdbReconciliation: cmdbReconciliationResults,
        cached: false,
        incidentCreated,
        incidentNumber,
        incidentSysId,
        incidentUrl,
        problemCreated,
        problemNumber,
        problemSysId,
        problemUrl,
        recordTypeSuggestion: classificationResult.record_type_suggestion,
        catalogRedirected,
        catalogRedirectReason,
        catalogItemsProvided,
      };
    } catch (error) {
      console.error(`[Case Triage] Failed to triage case ${webhook.case_number}:`, error);
      throw error;
    }
  }

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
    try {
      const { createAzureSearchClient } = await import("./azure-search-client");
      const azureSearchClient = createAzureSearchClient();
      if (azureSearchClient) {
        const testResult = await azureSearchClient.testConnection();
        results.azureSearch = testResult.success;
      }
    } catch (error) {
      console.error("[Case Triage] Azure Search test failed:", error);
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
