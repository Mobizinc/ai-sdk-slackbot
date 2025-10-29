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
import { getCmdbReconciliationService } from "./cmdb-reconciliation";
import { getCatalogRedirectHandler } from "./catalog-redirect-handler";
import { config } from "../config";
import type { NewCaseClassificationInbound, NewCaseClassificationResults, NewCaseDiscoveredEntities } from "../db/schema";
import { createSystemContext } from "../infrastructure/servicenow-context";

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
   * Enable catalog redirect for HR requests
   * If true, automatically redirects misrouted HR requests to catalog items
   */
  enableCatalogRedirect?: boolean;

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
  cmdbReconciliation?: any; // TODO: Import proper type from cmdb-reconciliation
  cached: boolean;
  cacheReason?: string;
  // ITSM record type fields
  incidentCreated: boolean;
  incidentNumber?: string;
  incidentSysId?: string;
  incidentUrl?: string;
  problemCreated: boolean;
  problemNumber?: string;
  problemSysId?: string;
  problemUrl?: string;
  recordTypeSuggestion?: {
    type: string;
    is_major_incident: boolean;
    reasoning: string;
  };
  // Catalog redirect fields
  catalogRedirected: boolean;
  catalogRedirectReason?: string;
  catalogItemsProvided?: number;
}

export class CaseTriageService {
  private repository = getCaseClassificationRepository();
  private workflowRouter = getWorkflowRouter();
  private classifier = getCaseClassifier();
  private azureSearchClient = createAzureSearchClient();
  private categorySyncService = getCategorySyncService();
  private catalogRedirectHandler = getCatalogRedirectHandler();

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
    const snContext = createSystemContext('servicenow-webhook');

    // Default options (matching original behavior)
    const {
      enableCaching = true,
      enableSimilarCases = true,
      enableKBArticles = true,
      enableBusinessContext = true,
      enableWorkflowRouting = true,
      writeToServiceNow = config.caseClassificationWriteNotes,
      enableCatalogRedirect = config.catalogRedirectEnabled,
      maxRetries = config.caseClassificationMaxRetries,
    } = options;

    console.log(`[Case Triage] Starting triage for case ${webhook.case_number}`);

    try {
      // Step 0: Idempotency check - return existing result if processed recently
      // This prevents duplicate work if QStash retries after partial success
      if (enableCaching) {
        const recentResult = await this.checkRecentClassification(
          webhook.case_number,
          5 // minutes
        );

        if (recentResult) {
          const processingTime = Date.now() - startTime;
          console.log(
            `[Case Triage] Idempotency check: ${webhook.case_number} was processed ` +
            `${Math.round((Date.now() - recentResult.classifiedAt.getTime()) / 1000)}s ago - ` +
            `returning cached result (${processingTime}ms)`
          );

          return {
            ...recentResult,
            cached: true,
            cacheReason: "Recently processed - idempotency guard (prevents duplicate work from retries)",
            processingTimeMs: processingTime,
          };
        }
      }

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

      // Step 4: Fetch ServiceNow categories from database cache (TABLE-SPECIFIC for dual categorization)
      const categoriesStart = Date.now();
      const categoriesData = await this.categorySyncService.getCategoriesForClassifier(
        13 // maxAgeHours
      );
      const categoriesTime = Date.now() - categoriesStart;

      if (categoriesData.isStale) {
        console.warn('[Case Triage] Categories are stale - consider running sync');
      }

      console.log(
        `[Case Triage] Using categories from ${categoriesData.tablesCovered.length}/2 ITSM tables: ` +
        `Cases (${categoriesData.caseCategories.length} categories), ` +
        `Incidents (${categoriesData.incidentCategories.length} categories) (${categoriesTime}ms)`
      );

      // Step 5: Convert webhook to classification request
      const classificationRequest = this.webhookToClassificationRequest(webhook);

      // Note: Similar cases and KB articles are fetched by the classifier internally
      // The classifier uses the new Azure Search client with vector search and MSP attribution

      // Step 6: Set real ServiceNow categories in classifier (TABLE-SPECIFIC)
      this.classifier.setCategories(
        categoriesData.caseCategories,
        categoriesData.incidentCategories,
        categoriesData.caseSubcategories,
        categoriesData.incidentSubcategories
      );

      // Step 6.5: Fetch company-specific application services (dynamic, scales for all clients)
      if (webhook.company) {
        try {
          const { serviceNowClient } = await import("../tools/servicenow");
          const applicationsStart = Date.now();
          const companyApplications = await serviceNowClient.getApplicationServicesForCompany(
            {
              companySysId: webhook.company,
              parentServiceOffering: "Application Administration",
              limit: 100
            },
            snContext,
          );
          const applicationsTime = Date.now() - applicationsStart;

          if (companyApplications.length > 0) {
            this.classifier.setApplicationServices(companyApplications);
            console.log(
              `[Case Triage] Loaded ${companyApplications.length} application services ` +
              `for company ${webhook.account_id || webhook.company} (${applicationsTime}ms)`
            );
          } else {
            console.log(
              `[Case Triage] No application services found for company ${webhook.account_id || webhook.company} ` +
              `- using generic application list in prompt`
            );
          }
        } catch (error) {
          console.warn(
            `[Case Triage] Failed to fetch application services for company ${webhook.company}:`,
            error
          );
          // Continue with classification - classifier will use generic fallback
        }
      } else {
        console.log(
          `[Case Triage] No company sys_id available - using generic application list in prompt`
        );
      }

      // Step 7: Perform classification with retry logic (using real ServiceNow categories)
      const classificationStart = Date.now();
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

      const classificationTime = Date.now() - classificationStart;

      // Step 9: Format work note
      const workNoteContent = formatWorkNote(classificationResult);

      // Step 10: Write to ServiceNow (if enabled)
      let servicenowUpdated = false;
      let updateError: string | undefined;

      if (writeToServiceNow) {
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

      // Step 12.5: CMDB Reconciliation (if enabled)
      let cmdbReconciliationResults = null;
      if (config.cmdbReconciliationEnabled) {
        try {
          const cmdbService = getCmdbReconciliationService();
          cmdbReconciliationResults = await cmdbService.reconcileEntities({
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

      if (classificationResult.record_type_suggestion) {
        const suggestion = classificationResult.record_type_suggestion;

        console.log(
          `[Case Triage] Record type suggested: ${suggestion.type}` +
            `${suggestion.type === "Incident" ? ` (Major: ${suggestion.is_major_incident})` : ""}`
        );

        // Create Incident for service disruptions
        if (suggestion.type === 'Incident') {
          try {
            const { serviceNowClient } = await import("../tools/servicenow");

            // DUAL CATEGORIZATION: Use incident-specific category if provided, otherwise fall back to case category
            const incidentCategory =
              classificationResult.incident_category || classificationResult.category;
            const incidentSubcategory =
              classificationResult.incident_subcategory || classificationResult.subcategory;

            console.log(
              `[Case Triage] Creating Incident with category: ${incidentCategory}` +
                `${incidentSubcategory ? ` > ${incidentSubcategory}` : ""}` +
                `${classificationResult.incident_category ? " (incident-specific)" : " (fallback to case category)"}`
            );

            // SERVICE OFFERING LINKING: Query ServiceNow for Service Offering sys_id
            let businessServiceSysId = webhook.business_service; // Default to webhook value
            if (classificationResult.service_offering) {
              try {
                console.log(
                  `[Case Triage] Looking up Service Offering: "${classificationResult.service_offering}"`
                );
                const serviceOffering = await serviceNowClient.getServiceOffering(
                  classificationResult.service_offering,
                  snContext,
                );
                if (serviceOffering) {
                  businessServiceSysId = serviceOffering.sys_id;
                  console.log(
                    `[Case Triage] Linked Service Offering: ${serviceOffering.name} (${serviceOffering.sys_id})`
                  );
                } else {
                  console.warn(
                    `[Case Triage] Service Offering "${classificationResult.service_offering}" not found in ServiceNow`
                  );
                }
              } catch (error) {
                console.error(`[Case Triage] Failed to lookup Service Offering:`, error);
                // Continue with incident creation even if Service Offering lookup fails
              }
            }

            // Create Incident record with full company/context information
            const incidentResult = await serviceNowClient.createIncidentFromCase(
              {
                caseSysId: webhook.sys_id,
                caseNumber: webhook.case_number,
                category: incidentCategory,
                subcategory: incidentSubcategory,
                shortDescription: webhook.short_description,
                description: webhook.description,
                urgency: webhook.urgency,
                priority: webhook.priority,
                callerId: webhook.caller_id,
                assignmentGroup: webhook.assignment_group,
                assignedTo: webhook.assigned_to,
                isMajorIncident: suggestion.is_major_incident,
                // Company/Account context (prevents orphaned incidents)
                company: webhook.company,
                account: webhook.account || webhook.account_id,
                businessService: businessServiceSysId, // Use looked-up Service Offering sys_id
                location: webhook.location,
                // Contact information
                contact: webhook.contact,
                contactType: webhook.contact_type,
                openedBy: webhook.opened_by,
                // Technical context
                cmdbCi: webhook.cmdb_ci || webhook.configuration_item,
                // Multi-tenancy / Domain separation
                sysDomain: webhook.sys_domain,
                sysDomainPath: webhook.sys_domain_path,
              },
              snContext,
            );

            incidentCreated = true;
            incidentNumber = incidentResult.incident_number;
            incidentSysId = incidentResult.incident_sys_id;
            incidentUrl = incidentResult.incident_url;

            // Update case with incident reference (bidirectional link)
            // This makes the incident appear in "Related Records > Incident" tab
            await serviceNowClient.updateCase(webhook.sys_id, {
              incident: incidentSysId,
            }, snContext);

            // Add work note to parent Case
            const workNote =
              `🚨 ${suggestion.is_major_incident ? 'MAJOR ' : ''}INCIDENT CREATED\n\n` +
              `Incident: ${incidentNumber}\n` +
              `Reason: ${suggestion.reasoning}\n\n` +
              `Category: ${classificationResult.category}` +
              `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ""}\n\n` +
              `${suggestion.is_major_incident ? "⚠️ MAJOR INCIDENT - Immediate escalation required\n\n" : ""}` +
              `Link: ${incidentUrl}`;

            await serviceNowClient.addCaseWorkNote(webhook.sys_id, workNote, true, snContext);

            console.log(
              `[Case Triage] Created ${suggestion.is_major_incident ? 'MAJOR ' : ''}` +
              `Incident ${incidentNumber} from Case ${webhook.case_number}`
            );
          } catch (error) {
            console.error("[Case Triage] Failed to create Incident:", error);
            // Don't fail the entire triage - log error but continue
          }
        } else if (suggestion.type === 'Problem') {
          // Create Problem for root cause analysis
          try {
            const { serviceNowClient } = await import('../tools/servicenow');

            // DUAL CATEGORIZATION: Use incident-specific category if provided, otherwise fall back to case category
            const problemCategory = classificationResult.incident_category || classificationResult.category;
            const problemSubcategory = classificationResult.incident_subcategory || classificationResult.subcategory;

            console.log(
              `[Case Triage] Creating Problem with category: ${problemCategory}` +
              `${problemSubcategory ? ` > ${problemSubcategory}` : ''}` +
              `${classificationResult.incident_category ? ' (incident-specific)' : ' (fallback to case category)'}`
            );

            // SERVICE OFFERING LINKING: Query ServiceNow for Service Offering sys_id
            let businessServiceSysId = webhook.business_service; // Default to webhook value
            if (classificationResult.service_offering) {
              try {
                console.log(
                  `[Case Triage] Looking up Service Offering: "${classificationResult.service_offering}"`
                );
                const serviceOffering = await serviceNowClient.getServiceOffering(
                  classificationResult.service_offering,
                  snContext,
                );
                if (serviceOffering) {
                  businessServiceSysId = serviceOffering.sys_id;
                  console.log(
                    `[Case Triage] Linked Service Offering: ${serviceOffering.name} (${serviceOffering.sys_id})`
                  );
                } else {
                  console.warn(
                    `[Case Triage] Service Offering "${classificationResult.service_offering}" not found in ServiceNow`
                  );
                }
              } catch (error) {
                console.error(`[Case Triage] Failed to lookup Service Offering:`, error);
                // Continue with problem creation even if Service Offering lookup fails
              }
            }

            // Create Problem record with full company/context information
            const problemResult = await serviceNowClient.createProblemFromCase(
              {
                caseSysId: webhook.sys_id,
                caseNumber: webhook.case_number,
                category: problemCategory,
                subcategory: problemSubcategory,
                shortDescription: webhook.short_description,
                description: webhook.description,
                urgency: webhook.urgency,
                priority: webhook.priority,
                callerId: webhook.caller_id,
                assignmentGroup: webhook.assignment_group,
                assignedTo: webhook.assigned_to,
                firstReportedBy: webhook.sys_id, // Reference to the Case that first reported this problem
                // Company/Account context (prevents orphaned problems)
                company: webhook.company,
                account: webhook.account || webhook.account_id,
                businessService: businessServiceSysId, // Use looked-up Service Offering sys_id
                location: webhook.location,
                // Contact information
                contact: webhook.contact,
                contactType: webhook.contact_type,
                openedBy: webhook.opened_by,
                // Technical context
              cmdbCi: webhook.cmdb_ci || webhook.configuration_item,
              // Multi-tenancy / Domain separation
              sysDomain: webhook.sys_domain,
              sysDomainPath: webhook.sys_domain_path,
              },
              snContext,
            );

            problemCreated = true;
            problemNumber = problemResult.problem_number;
            problemSysId = problemResult.problem_sys_id;
            problemUrl = problemResult.problem_url;

            // Update case with problem reference (bidirectional link)
            // This makes the problem appear in "Related Records > Problem" tab
            await serviceNowClient.updateCase(webhook.sys_id, {
              problem: problemSysId
            }, snContext);

            // Add work note to parent Case
            const workNote =
              `🔍 PROBLEM CREATED\n\n` +
              `Problem: ${problemNumber}\n` +
              `Reason: ${suggestion.reasoning}\n\n` +
              `Category: ${classificationResult.category}` +
              `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ''}\n\n` +
              `Link: ${problemUrl}`;

            await serviceNowClient.addCaseWorkNote(webhook.sys_id, workNote, true, snContext);

            console.log(
              `[Case Triage] Created Problem ${problemNumber} from Case ${webhook.case_number}`
            );
          } catch (error) {
            console.error('[Case Triage] Failed to create Problem:', error);
            // Don't fail the entire triage - log error but continue
          }
        } else if (suggestion.type === 'Change') {
          // Log but don't auto-create (Changes require CAB approval)
          console.log(
            `[Case Triage] Change suggested for ${webhook.case_number} - ` +
              `manual Change Management process required`
          );
        }
      }

      // Step 14: Check for catalog redirect (HR requests submitted incorrectly)
      let catalogRedirected = false;
      let catalogRedirectReason: string | undefined;
      let catalogItemsProvided = 0;

      if (enableCatalogRedirect && !incidentCreated && !problemCreated) {
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

      // Log timing breakdown for performance analysis
      const storageTime = Date.now() - startTime - classificationTime - categoriesTime;
      console.log(
        `[Case Triage] Timing breakdown: ` +
        `categories=${categoriesTime}ms, classification=${classificationTime}ms, ` +
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
   * Check if case was classified very recently (idempotency guard)
   *
   * This is separate from the workflow/assignment-based cache check.
   * It prevents duplicate work when QStash retries after a partial success.
   *
   * Returns classification if created within the specified time window.
   */
  private async checkRecentClassification(
    caseNumber: string,
    withinMinutes: number
  ): Promise<(CaseTriageResult & { classifiedAt: Date }) | null> {
    try {
      const latestResult = await this.repository.getLatestClassificationResult(caseNumber);

      if (!latestResult) {
        return null;
      }

      // Check if classification is recent
      const ageMs = Date.now() - latestResult.createdAt.getTime();
      const ageMinutes = ageMs / 60000;

      if (ageMinutes > withinMinutes) {
        return null; // Too old for idempotency guard
      }

      console.log(
        `[Case Triage] Recent classification found for ${caseNumber} ` +
        `(${Math.round(ageMinutes * 60)}s ago)`
      );

      const cachedClassification = latestResult.classificationJson as any;

      return {
        caseNumber,
        caseSysId: (cachedClassification as any).sys_id || "",
        workflowId: latestResult.workflowId,
        classification: cachedClassification,
        similarCases: ((cachedClassification as any).similar_cases || []) as SimilarCaseResult[],
        kbArticles: ((cachedClassification as any).kb_articles || []) as KBArticleResult[],
        servicenowUpdated: latestResult.servicenowUpdated,
        processingTimeMs: latestResult.processingTimeMs,
        entitiesDiscovered: latestResult.entitiesCount,
        cached: true,
        incidentCreated: false,
        problemCreated: false,
        catalogRedirected: false,
        recordTypeSuggestion: (cachedClassification as any).record_type_suggestion,
        classifiedAt: latestResult.createdAt,
      };
    } catch (error) {
      console.error("[Case Triage] Error checking recent classification:", error);
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

      const cachedClassification = latestResult.classificationJson as any;

      return {
        caseNumber,
        caseSysId: cachedRouting.sys_id || "",
        workflowId: latestResult.workflowId,
        classification: cachedClassification,
        similarCases: (cachedRouting.similar_cases || []) as SimilarCaseResult[],
        kbArticles: (cachedRouting.kb_articles || []) as KBArticleResult[],
        servicenowUpdated: latestResult.servicenowUpdated,
        processingTimeMs: latestResult.processingTimeMs,
        entitiesDiscovered: latestResult.entitiesCount,
        cached: true,
        cacheReason: "Previous classification found for same case + workflow + assignment",
        // ITSM record type fields from cached classification
        incidentCreated: false, // Cached results don't trigger new incident creation
        problemCreated: false, // Cached results don't trigger new problem creation
        recordTypeSuggestion: cachedClassification.record_type_suggestion,
        // Catalog redirect fields (cached results don't trigger new redirects)
        catalogRedirected: false,
        catalogItemsProvided: 0,
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
        // Service Portfolio Classification (NEW)
        serviceOffering: data.classification.service_offering,
        applicationService: data.classification.application_service,
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
        network_devices: "NETWORK_DEVICE",
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
