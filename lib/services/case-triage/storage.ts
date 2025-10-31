/**
 * Case Triage Storage
 *
 * Database persistence operations for case triage workflow.
 * Handles saving inbound webhooks, classification results, and discovered entities.
 *
 * @module case-triage/storage
 *
 * @example
 * ```typescript
 * const repository = getCaseClassificationRepository();
 * const storage = new TriageStorage(repository);
 *
 * // Record inbound webhook
 * const inboundId = await storage.recordInbound(webhook);
 *
 * // Save classification results
 * await storage.saveClassification({
 *   caseNumber: "SCS0012345",
 *   workflowId: "standard",
 *   classification: result,
 *   processingTimeMs: 2500,
 *   servicenowUpdated: true,
 * });
 *
 * // Store discovered entities
 * const entityCount = await storage.saveEntities("SCS0012345", "abc123", classification);
 * ```
 */

import type { NewCaseClassificationInbound, NewCaseClassificationResults, NewCaseDiscoveredEntities } from "../../db/schema";
import type { ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import type { CaseClassification } from "../case-classifier";
import type { CaseClassificationRepository } from "../../db/repositories/case-classification-repository";
import { calculateClassificationCost } from "./scoring";
import { ENTITY_TYPE_MAPPING, ENTITY_VALUE_MAX_LENGTH } from "./constants";

/**
 * Re-export the repository type for external use
 */
export type { CaseClassificationRepository };

/**
 * Storage layer for case triage operations
 *
 * Manages persistence of:
 * - Inbound webhook payloads (for audit trail)
 * - Classification results (with token usage and cost)
 * - Discovered technical entities (IP addresses, systems, users, etc.)
 *
 * **Error Handling:**
 * - Storage failures are logged but don't throw
 * - Classification can succeed even if storage fails
 * - This ensures webhook processing is resilient
 *
 * **Database Schema:**
 * - case_classification_inbound - Raw webhook payloads
 * - case_classification_results - Classification outputs with metrics
 * - case_discovered_entities - Technical entities extracted by LLM
 */
export class TriageStorage {
  /**
   * @param repository - Database repository implementation
   */
  constructor(private repository: CaseClassificationRepository) {}

  /**
   * Record inbound webhook payload to database for audit trail
   *
   * Creates a record in case_classification_inbound table with the raw payload
   * and routing context. This provides an audit trail of all webhook deliveries
   * and enables idempotency checking.
   *
   * @param webhook - ServiceNow webhook payload
   * @returns Inbound record ID if successful, null if storage failed
   *
   * @example
   * ```typescript
   * const inboundId = await storage.recordInbound(webhook);
   * if (inboundId) {
   *   console.log(`Recorded inbound payload with ID: ${inboundId}`);
   * }
   * ```
   *
   * **Error Handling:**
   * - Returns null on failure (doesn't throw)
   * - Logs error but continues processing
   * - Null return means audit trail unavailable but classification proceeds
   */
  async recordInbound(webhook: ServiceNowCaseWebhook): Promise<number | null> {
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
      console.error("[Case Triage Storage] Failed to record inbound payload:", error);
      return null;
    }
  }

  /**
   * Store classification result to database with comprehensive metadata
   *
   * Persists the LLM classification output along with:
   * - Token usage (prompt, completion, total)
   * - Cost calculation (based on token usage)
   * - Model and provider information
   * - Processing time metrics
   * - Similar cases and KB articles counts
   * - Business intelligence detection flags
   * - Service portfolio classification (offering, application)
   *
   * @param data - Classification data with metadata
   * @param data.caseNumber - ServiceNow case number
   * @param data.workflowId - Workflow identifier used for classification
   * @param data.classification - Complete LLM classification result
   * @param data.processingTimeMs - Total processing time in milliseconds
   * @param data.servicenowUpdated - Whether work note was written to ServiceNow
   *
   * @example
   * ```typescript
   * await storage.saveClassification({
   *   caseNumber: "SCS0012345",
   *   workflowId: "standard",
   *   classification: {
   *     category: "Network",
   *     confidence_score: 0.92,
   *     token_usage_input: 15000,
   *     token_usage_output: 1200,
   *     // ...
   *   },
   *   processingTimeMs: 2500,
   *   servicenowUpdated: true,
   * });
   * ```
   *
   * **Error Handling:**
   * - Failures are logged but don't throw
   * - Classification success is independent of storage
   * - entitiesCount defaults to 0 (updated later by saveEntities)
   *
   * **Business Intelligence Detection:**
   * - Flags cases with project scope, executive visibility, compliance, or financial impact
   * - Used for escalation and priority routing
   */
  async saveClassification(data: {
    caseNumber: string;
    workflowId: string;
    classification: CaseClassification;
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
        cost: calculateClassificationCost(data.classification),
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
        // Service Portfolio Classification
        serviceOffering: data.classification.service_offering,
        applicationService: data.classification.application_service,
      };

      await this.repository.saveClassificationResult(resultData);

      console.log(`[Case Triage Storage] Stored classification result for ${data.caseNumber}`);
    } catch (error) {
      console.error("[Case Triage Storage] Failed to store classification result:", error);
      // Don't throw - classification succeeded, storage is secondary
    }
  }

  /**
   * Store discovered technical entities to database
   *
   * Extracts technical entities from LLM classification and persists them
   * individually for CMDB reconciliation and tracking.
   *
   * **Entity Types Mapped:**
   * - `ip_addresses` → IP_ADDRESS
   * - `systems` → SYSTEM
   * - `users` → USER
   * - `software` → SOFTWARE
   * - `error_codes` → ERROR_CODE
   * - `network_devices` → NETWORK_DEVICE
   *
   * @param caseNumber - ServiceNow case number
   * @param caseSysId - ServiceNow case sys_id
   * @param classification - Classification result with technical_entities field
   * @returns Number of entities successfully stored
   *
   * @example
   * ```typescript
   * const classification = {
   *   technical_entities: {
   *     ip_addresses: ["192.168.1.100", "10.0.0.5"],
   *     systems: ["exchange-server-01"],
   *     error_codes: ["0x80070005"]
   *   },
   *   confidence_score: 0.85
   * };
   *
   * const count = await storage.saveEntities("SCS0012345", "abc123", classification);
   * // Returns: 4 (2 IPs + 1 system + 1 error code)
   * ```
   *
   * **Entity Processing:**
   * - Entities are truncated to 500 chars (DB column limit)
   * - Unknown entity types are skipped
   * - Non-array values are skipped
   * - Empty lists result in 0 entities stored
   *
   * **Error Handling:**
   * - Returns 0 on failure (doesn't throw)
   * - Logs entity type counts on success
   * - Logs errors but doesn't block classification
   */
  async saveEntities(
    caseNumber: string,
    caseSysId: string,
    classification: CaseClassification
  ): Promise<number> {
    if (!classification.technical_entities) {
      return 0;
    }

    try {
      const entities: NewCaseDiscoveredEntities[] = [];

      // Map technical_entities to individual entity records
      for (const [entityCategory, entityList] of Object.entries(
        classification.technical_entities
      )) {
        const entityType = ENTITY_TYPE_MAPPING[entityCategory];
        if (!entityType || !Array.isArray(entityList)) {
          continue;
        }

        for (const entityValue of entityList) {
          entities.push({
            caseNumber,
            caseSysId,
            entityType,
            entityValue: String(entityValue).substring(0, ENTITY_VALUE_MAX_LENGTH),
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
        `[Case Triage Storage] Stored ${entities.length} entities for ${caseNumber}:`,
        entityTypeCounts
      );

      return entities.length;
    } catch (error) {
      console.error("[Case Triage Storage] Failed to store entities:", error);
      return 0;
    }
  }
}
