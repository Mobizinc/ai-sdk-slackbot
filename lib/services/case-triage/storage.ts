/**
 * Case Triage Storage
 *
 * Database persistence operations for case triage workflow.
 */

import type { NewCaseClassificationInbound, NewCaseClassificationResults, NewCaseDiscoveredEntities } from "../../db/schema";
import type { ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import type { CaseClassification } from "../case-classifier";
import { calculateClassificationCost } from "./scoring";

export interface CaseClassificationRepository {
  saveInboundPayload(data: NewCaseClassificationInbound): Promise<void>;
  getUnprocessedPayload(caseNumber: string): Promise<{ id: number } | null>;
  markPayloadAsProcessed(id: number, workflowId: string): Promise<void>;
  saveClassificationResult(data: NewCaseClassificationResults): Promise<void>;
  saveDiscoveredEntities(entities: NewCaseDiscoveredEntities[]): Promise<void>;
  getLatestClassificationResult(caseNumber: string): Promise<any>;
  getClassificationStats(days: number): Promise<any>;
}

/**
 * Storage layer for case triage operations
 */
export class TriageStorage {
  constructor(private repository: CaseClassificationRepository) {}

  /**
   * Record inbound webhook payload to database
   *
   * @param webhook - ServiceNow webhook payload
   * @returns Inbound record ID or null if storage failed
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
   * Store classification result to database
   *
   * @param data - Classification data with metadata
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
   * Store discovered entities to database
   *
   * @param caseNumber - Case number
   * @param caseSysId - Case sys_id
   * @param classification - Classification result with technical_entities
   * @returns Number of entities stored
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
