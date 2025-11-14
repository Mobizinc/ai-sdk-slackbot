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
import type { RoutingResult } from "./workflow-router";
import { getCaseClassificationRepository } from "../db/repositories/case-classification-repository";
import { getWorkflowRouter } from "./workflow-router";
import { getCaseClassifier } from "./case-classifier";
import { getCategorySyncService } from "./servicenow-category-sync";
import { getCmdbReconciliationService } from "./cmdb-reconciliation";
import { getCatalogRedirectHandler } from "./catalog-redirect-handler";
import { getEscalationService } from "./escalation-service";
import { config } from "../config";

// Import from extracted modules
import type { CaseTriageOptions, CaseTriageResult, ClassificationStageResult, WorkflowDecision } from "./case-triage/types";
import { TriageStorage } from "./case-triage/storage";
import { TriageCache } from "./case-triage/cache";
import { enrichClassificationContext } from "./case-triage/retrieval";
import { handleRecordTypeSuggestion } from "./case-triage/incident-handler";
import { formatWorkNote } from "./case-triage/formatters";
import { getClassificationConfig, IDEMPOTENCY_WINDOW_MINUTES } from "./case-triage/constants";
import type { ClassificationConfig } from "./case-triage/constants";
import { createTriageSystemContext } from "./case-triage/context";
import { runClassificationAgent } from "../agent/classification";
import type { DiscoveryContextPack } from "../agent/discovery/context-pack";
import { reviewServiceNowArtifact } from "../supervisor";
import { getClientScopePolicyService } from "./client-scope-policy-service";
import { evaluateScopeAgainstPolicy } from "./client-scope-evaluator";

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
    const stage = await this.runClassificationStage(webhook, options);
    return this.applyDeterministicActions(stage, options);
  }

  async runClassificationStage(
    webhook: ServiceNowCaseWebhook,
    options: CaseTriageOptions = {}
  ): Promise<ClassificationStageResult> {
    const startTime = Date.now();
    const snContext = createTriageSystemContext();
    const fullConfig = getClassificationConfig(options, config);

    console.log(`[Case Triage] Starting triage for case ${webhook.case_number}`);

    if (fullConfig.enableCaching) {
      const idempotencyResult = await this.cache.checkIdempotency(
        webhook.case_number,
        IDEMPOTENCY_WINDOW_MINUTES
      );

      if (idempotencyResult.hit && idempotencyResult.data) {
        const processingTime = Date.now() - startTime;
        console.log(
          `[Case Triage] Idempotency HIT for ${webhook.case_number} - returning cached result (${processingTime}ms)`
        );

        return this.buildCachedStageResult(
          {
            ...idempotencyResult.data,
            processingTimeMs: processingTime,
          },
          webhook,
          snContext as Record<string, unknown>,
          fullConfig,
          {
            startTime,
            cacheReason: idempotencyResult.reason ?? "idempotency_hit",
          }
        );
      }
    }

    let inboundId: number | null = null;

    try {
      inboundId = await this.storage.recordInbound(webhook);
    } catch (error) {
      console.warn("[Case Triage] Failed to record inbound payload:", error);
    }

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

    if (fullConfig.enableCaching) {
      const cacheResult = await this.cache.checkWorkflowCache({
        caseNumber: webhook.case_number,
        workflowId: workflowDecision.workflowId,
        assignmentGroup: webhook.assignment_group || null,
      });

      if (cacheResult.hit && cacheResult.data) {
        if (inboundId) {
          await this.repository.markPayloadAsProcessed(
            inboundId,
            workflowDecision.workflowId
          );
        }

        const processingTime = Date.now() - startTime;
        console.log(
          `[Case Triage] Workflow cache HIT for ${webhook.case_number} - returning cached result (${processingTime}ms)`
        );

        return this.buildCachedStageResult(
          {
            ...cacheResult.data,
            processingTimeMs: processingTime,
          },
          webhook,
          snContext as Record<string, unknown>,
          fullConfig,
          {
            startTime,
            inboundId,
            workflowDecision,
            cacheReason: cacheResult.reason ?? "workflow_cache_hit",
          }
        );
      }
    }

    const enrichment = await enrichClassificationContext(
      webhook,
      this.categorySyncService,
      snContext
    );

    this.classifier.setCategories(
      enrichment.categories.data.caseCategories,
      enrichment.categories.data.incidentCategories,
      enrichment.categories.data.caseSubcategories,
      enrichment.categories.data.incidentSubcategories
    );

    if (enrichment.applicationServices.length > 0) {
      this.classifier.setApplicationServices(enrichment.applicationServices);
    }

    const discoveryPack = buildDiscoveryPackForWebhook(webhook);
    const classificationStart = Date.now();
    let classificationResult: any | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= fullConfig.maxRetries; attempt += 1) {
      try {
        classificationResult = await runClassificationAgent(
          {
            caseNumber: webhook.case_number,
            sysId: webhook.sys_id,
            shortDescription: webhook.short_description,
            description: webhook.description,
            assignmentGroup: webhook.assignment_group,
            urgency: webhook.urgency,
            currentCategory: webhook.category,
            priority: webhook.priority,
            state: webhook.state,
            companySysId: webhook.company,
            companyName: webhook.account_id,
            discoveryPack,
          },
          { classifier: this.classifier }
        );

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
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (!classificationResult) {
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
    const workNoteContent = formatWorkNote(classificationResult);
    const processingTime = Date.now() - startTime;

    const policySummary = clientScopePolicyService.getPolicySummary(
      webhook.account_id || webhook.account
    );
    const scopeEvaluation = evaluateScopeAgainstPolicy(policySummary, classificationResult);
    if (scopeEvaluation) {
      classificationResult.scope_evaluation = scopeEvaluation;
      if (scopeEvaluation.shouldEscalate) {
        classificationResult.business_intelligence =
          classificationResult.business_intelligence || {};
        classificationResult.business_intelligence.project_scope_detected = true;
        const newReason = scopeEvaluation.reasons.join("; ") || "Contract scope exceeded";
        classificationResult.business_intelligence.project_scope_reason =
          classificationResult.business_intelligence.project_scope_reason
            ? `${classificationResult.business_intelligence.project_scope_reason} | ${newReason}`
            : newReason;
      }
    }

    return {
      core: {
        caseNumber: webhook.case_number,
        caseSysId: webhook.sys_id,
        workflowId: workflowDecision.workflowId,
        classification: classificationResult,
        similarCases: classificationResult.similar_cases || [],
        kbArticles: classificationResult.kb_articles || [],
        processingTimeMs: processingTime,
        cached: false,
        recordTypeSuggestion: classificationResult.record_type_suggestion,
        queueTimeMs: classificationResult.queue_time_ms,
      },
      metadata: {
        webhook,
        workflowDecision,
        inboundId,
        snContext: snContext as Record<string, unknown>,
        workNoteContent,
        rawClassificationResult: classificationResult,
        fullConfig,
        startTime,
        classificationTimeMs: classificationTime,
        sideEffectsAlreadyApplied: false,
        retrievalStats: {
          categoriesFetchMs: enrichment.categories.fetchTimeMs,
          applicationsFetchMs: enrichment.applicationsFetchTimeMs,
        },
      },
    };
  }

  async applyDeterministicActions(
    stage: ClassificationStageResult,
    _options: CaseTriageOptions = {}
  ): Promise<CaseTriageResult> {
    const { core, metadata, completedResult } = stage;

    if (metadata.sideEffectsAlreadyApplied && completedResult) {
      return completedResult;
    }

    const startTime = metadata.startTime;
    const { fullConfig, snContext, webhook, workflowDecision } = metadata;
    const classificationResult = metadata.rawClassificationResult;

    let servicenowUpdated = false;
    let updateError: string | undefined;
    const workNoteContent = metadata.workNoteContent || formatWorkNote(classificationResult);

    if (fullConfig.writeToServiceNow) {
      const supervisorDecision = await reviewServiceNowArtifact({
        caseNumber: webhook.case_number,
        content: workNoteContent,
        classification: classificationResult,
        metadata: {
          sysId: webhook.sys_id,
          duplicateKey: webhook.case_number,
        },
      });

      if (supervisorDecision.status === "blocked") {
        updateError = supervisorDecision.reason;
        console.warn(
          `[Case Triage] Supervisor blocked ServiceNow write for ${webhook.case_number}` +
            `${supervisorDecision.stateId ? ` (state: ${supervisorDecision.stateId})` : ""}`
        );
      } else {
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
    }

    let entitiesStored = 0;
    try {
      const interimProcessingTime = Date.now() - startTime;
      await this.storage.saveClassification({
        caseNumber: webhook.case_number,
        workflowId: workflowDecision.workflowId,
        classification: classificationResult,
        processingTimeMs: interimProcessingTime,
        servicenowUpdated,
      });

      entitiesStored = await this.storage.saveEntities(
        webhook.case_number,
        webhook.sys_id,
        classificationResult
      );
    } catch (error) {
      console.error("[Case Triage] Failed to persist classification entities:", error);
    }

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
      }
    }

    let incidentCreated = false;
    let incidentNumber: string | undefined;
    let incidentSysId: string | undefined;
    let incidentUrl: string | undefined;
    let problemCreated = false;
    let problemNumber: string | undefined;
    let problemSysId: string | undefined;
    let problemUrl: string | undefined;

    try {
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
    } catch (error) {
      console.error(`[Case Triage] Incident/Problem handling failed for ${webhook.case_number}:`, error);
    }

    let catalogRedirected = false;
    let catalogRedirectReason: string | undefined;
    let catalogItemsProvided = 0;

    if (fullConfig.enableCatalogRedirect && !incidentCreated && !problemCreated) {
      try {
        const redirectResult = await this.catalogRedirectHandler.processCase({
          caseNumber: webhook.case_number,
          caseSysId: webhook.sys_id,
          shortDescription: webhook.short_description,
          description: webhook.description,
          category: classificationResult.category,
          subcategory: classificationResult.subcategory,
          companyId: webhook.company,
          submittedBy: webhook.caller_id,
          clientName: webhook.account_id,
        });

        if (redirectResult.redirected) {
          catalogRedirected = true;
          catalogItemsProvided = redirectResult.catalogItems.length;
          catalogRedirectReason =
            `HR request detected and redirected to catalog. ` +
            `${redirectResult.caseClosed ? "Case automatically closed." : "Work note added."}`;

          console.log(
            `[Case Triage] Catalog redirect successful for ${webhook.case_number}: ` +
              `${catalogItemsProvided} catalog items provided, case closed: ${redirectResult.caseClosed}`
          );
        }
      } catch (error) {
        console.error(`[Case Triage] Catalog redirect failed for ${webhook.case_number}:`, error);
      }
    }

    if (metadata.inboundId) {
      try {
        await this.repository.markPayloadAsProcessed(
          metadata.inboundId,
          workflowDecision.workflowId
        );
      } catch (error) {
        console.warn("[Case Triage] Failed to mark inbound payload as processed:", error);
      }
    }

    if (classificationResult.business_intelligence) {
      try {
        const { getEscalationService } = await import("./escalation-service");
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
          companyName: webhook.account_id || webhook.account,
          contactName: webhook.caller_id,
        });

        console.log(`[Case Triage] Escalation check completed for ${webhook.case_number}`);
      } catch (error) {
        console.error(`[Case Triage] Escalation failed for ${webhook.case_number}:`, error);
      }
    }

    const totalProcessingTime = Date.now() - startTime;
    const retrievalTime =
      (metadata.retrievalStats?.categoriesFetchMs || 0) +
      (metadata.retrievalStats?.applicationsFetchMs || 0);
    const storageTime = totalProcessingTime - metadata.classificationTimeMs - retrievalTime;

    console.log(
      `[Case Triage] Timing breakdown: retrieval=${retrievalTime}ms, classification=${metadata.classificationTimeMs}ms, storage/updates=${storageTime}ms, total=${totalProcessingTime}ms`
    );

    console.log(
      `[Case Triage] Completed triage for ${webhook.case_number}: ` +
        `${classificationResult.category || "Unknown"}` +
        `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ""}` +
        ` (${Math.round((classificationResult.confidence_score || 0) * 100)}% confidence)` +
        ` in ${totalProcessingTime}ms` +
        `${incidentCreated ? ` | Incident ${incidentNumber} created` : ""}` +
        `${problemCreated ? ` | Problem ${problemNumber} created` : ""}` +
        `${catalogRedirected ? ` | Redirected to catalog (${catalogItemsProvided} items)` : ""}`
    );

    return {
      caseNumber: core.caseNumber,
      caseSysId: core.caseSysId,
      workflowId: core.workflowId,
      classification: classificationResult,
      similarCases: core.similarCases,
      kbArticles: core.kbArticles,
      servicenowUpdated,
      updateError,
      processingTimeMs: totalProcessingTime,
      entitiesDiscovered: entitiesStored,
      cmdbReconciliation: cmdbReconciliationResults,
      cached: core.cached,
      cacheReason: core.cacheReason,
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
  }

  private buildCachedStageResult(
    completedResult: CaseTriageResult,
    webhook: ServiceNowCaseWebhook,
    snContext: Record<string, unknown>,
    fullConfig: ClassificationConfig,
    options: {
      startTime: number;
      inboundId?: number | null;
      workflowDecision?: RoutingResult;
      cacheReason: string;
    }
  ): ClassificationStageResult {
    return {
      core: {
        caseNumber: completedResult.caseNumber,
        caseSysId: completedResult.caseSysId,
        workflowId: completedResult.workflowId,
        classification: completedResult.classification,
        similarCases: completedResult.similarCases,
        kbArticles: completedResult.kbArticles,
        processingTimeMs: completedResult.processingTimeMs,
        cached: true,
        cacheReason: options.cacheReason,
        recordTypeSuggestion: completedResult.recordTypeSuggestion,
      },
      metadata: {
        webhook,
        workflowDecision:
          options.workflowDecision ??
          {
            workflowId: completedResult.workflowId,
            ruleMatched: false,
          },
        inboundId: options.inboundId ?? null,
        snContext,
        workNoteContent: undefined,
        rawClassificationResult: completedResult.classification,
        fullConfig,
        startTime: options.startTime,
        classificationTimeMs: 0,
        sideEffectsAlreadyApplied: true,
      },
      completedResult,
    };
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

const clientScopePolicyService = getClientScopePolicyService();

function buildDiscoveryPackForWebhook(
  webhook: ServiceNowCaseWebhook
): DiscoveryContextPack {
  const timestamp = new Date().toISOString();
  const clientScopePolicy = clientScopePolicyService.getPolicySummary(
    webhook.account_id || webhook.account
  );

  return {
    schemaVersion: "1.0.0",
    generatedAt: timestamp,
    metadata: {
      caseNumbers: [webhook.case_number],
      companyName: webhook.account_id || undefined,
    },
    caseContext: {
      caseNumber: webhook.case_number,
      detectedAt: timestamp,
      lastUpdated: timestamp,
      messageCount: 0,
    },
    policyAlerts: [],
    ...(clientScopePolicy ? { clientScopePolicy } : {}),
  };
}
// Singleton instance
let triageService: CaseTriageService | null = null;

export function getCaseTriageService(): CaseTriageService {
  if (!triageService) {
    triageService = new CaseTriageService();
  }
  return triageService;
}
