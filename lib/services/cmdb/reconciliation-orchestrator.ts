/**
 * Reconciliation Orchestrator
 * 
 * Main coordination service for CMDB reconciliation workflow.
 * Orchestrates existing services without duplicating functionality.
 */

import { ServiceNowClient } from "../../tools/servicenow";
import { getCmdbReconciliationRepository } from "../../db/repositories/cmdb-reconciliation-repository";
import { getSlackMessagingService } from "../slack-messaging";
import { config } from "../../config";
import { createSystemContext } from "../../infrastructure/servicenow-context";
import { EntityResolutionService } from "./entity-resolution-service";
import { CmdbMatchProcessor } from "./cmdb-match-processor";
import type { 
  EntityInput, 
  ReconciliationInput, 
  ReconciliationResult,
  SideEffectResult,
  ProcessingStats
} from "./types";
import type { CmdbReconciliationResult } from "../../db/schema";

export class ReconciliationOrchestrator {
  private repository = getCmdbReconciliationRepository();
  private entityResolver = new EntityResolutionService();
  private matchProcessor = new CmdbMatchProcessor();
  private serviceNowClient = new ServiceNowClient();
  private slackMessaging = getSlackMessagingService();

  /**
   * Reconcile multiple entities for a case
   * Main entry point for reconciliation workflow
   */
  async reconcileEntities(input: ReconciliationInput): Promise<ReconciliationResult> {
    console.log(`[CMDB Orchestrator] Starting reconciliation for case ${input.caseNumber}`);

    // Create ServiceNow context for system operation
    const snContext = createSystemContext('cmdb-reconciliation');

    const allEntities = this.flattenEntities(input.entities);
    const results: CmdbReconciliationResult[] = [];

    for (const entity of allEntities) {
      try {
        const result = await this.reconcileEntity(input.caseNumber, input.caseSysId, entity, snContext);
        results.push(result);
      } catch (error) {
        console.error(`[CMDB Orchestrator] Error reconciling entity ${entity.value}:`, error);
        
        // Create error record using existing repository
        const errorRecord = await this.repository.create({
          caseNumber: input.caseNumber,
          caseSysId: input.caseSysId,
          entityValue: entity.value,
          entityType: entity.type,
          originalEntityValue: entity.value,
          reconciliationStatus: "skipped",
          confidence: 0,
          errorMessage: error instanceof Error ? error.message : String(error),
          metadata: { error: true },
        });
        results.push(errorRecord);
      }
    }

    const stats = await this.repository.getCaseStatistics(input.caseNumber);
    
    console.log(`[CMDB Orchestrator] Reconciliation complete for case ${input.caseNumber}:`, stats);
    
    return {
      caseNumber: input.caseNumber,
      totalEntities: allEntities.length,
      ...stats,
      results,
    };
  }

  /**
   * Reconcile a single entity through the complete workflow
   */
  async reconcileEntity(
    caseNumber: string,
    caseSysId: string,
    entity: EntityInput,
    snContext: any
  ): Promise<CmdbReconciliationResult> {
    // Step 1: Resolve entity using existing business context
    const resolution = await this.entityResolver.resolveEntity(entity.value, entity.type as any);
    
    if (!resolution.isAliasResolved || !resolution.resolvedValue) {
      // Skip unresolved aliases
      return await this.repository.create({
        caseNumber,
        caseSysId,
        entityValue: entity.value,
        entityType: entity.type,
        originalEntityValue: entity.value,
        resolvedEntityValue: resolution.resolvedValue,
        reconciliationStatus: "skipped",
        confidence: 0,
        businessContextMatch: resolution.businessContextMatch,
        metadata: { 
          reason: "unresolved_alias",
          originalValue: entity.value,
        },
      });
    }

    // Step 2: Search CMDB using existing ServiceNowClient
    const cmdbMatches = await this.searchCmdb(resolution.resolvedValue, entity.type, snContext);
    
    // Step 3: Process matches using pure business logic
    const matchResult = await this.matchProcessor.processMatches(cmdbMatches, entity.value, entity.type);
    
    // Step 4: Create initial record
    const record = await this.repository.create({
      caseNumber,
      caseSysId,
      entityValue: entity.value,
      entityType: entity.type,
      originalEntityValue: entity.value,
      resolvedEntityValue: resolution.resolvedValue,
      reconciliationStatus: "matched", // Will be updated based on match result
      confidence: matchResult.confidence,
      businessContextMatch: resolution.businessContextMatch,
      metadata: {
        searchValue: resolution.resolvedValue,
        matchCount: cmdbMatches.length,
        matchAction: matchResult.action,
      },
    });

    // Step 5: Execute side effects based on match result
    return await this.executeSideEffects(record.id, caseSysId, caseNumber, entity, matchResult, resolution, snContext);
  }

  /**
   * Execute side effects based on match processing result
   */
  private async executeSideEffects(
    recordId: number,
    caseSysId: string,
    caseNumber: string,
    entity: EntityInput,
    matchResult: any,
    resolution: any,
    snContext: any
  ): Promise<CmdbReconciliationResult> {
    switch (matchResult.action) {
      case 'link_ci':
        await this.linkCiToCase(caseSysId, matchResult.match, snContext);
        return await this.repository.updateWithMatch(recordId, {
          cmdbSysId: matchResult.match.sys_id,
          cmdbName: matchResult.match.name,
          cmdbClass: matchResult.match.sys_class_name,
          cmdbUrl: matchResult.match.url,
          confidence: matchResult.confidence,
        });

      case 'create_task':
        await this.createChildTaskForMissingCi(
          recordId, caseSysId, caseNumber, entity.value, resolution.resolvedValue
        );
        return await this.repository.markAsSkipped(recordId, "No CMDB match found - child task created");

      case 'ambiguous':
        return await this.repository.markAsAmbiguous(recordId, matchResult.details);

      default:
        return await this.repository.markAsSkipped(recordId, `Unknown action: ${matchResult.action}`);
    }
  }

  /**
   * Search CMDB for configuration items
   * Reuses existing ServiceNowClient search logic
   */
  private async searchCmdb(
    entityValue: string,
    entityType: string,
    snContext: any
  ): Promise<any[]> {
    try {
      if (entityType === "IP_ADDRESS") {
        return await this.serviceNowClient.searchConfigurationItems(
          { ipAddress: entityValue, limit: 5 },
          snContext,
        );
      } else if (entityType === "NETWORK_DEVICE") {
        return await this.serviceNowClient.searchConfigurationItems(
          { name: entityValue, limit: 5 },
          snContext,
        );
      } else {
        return await this.serviceNowClient.searchConfigurationItems(
          { name: entityValue, limit: 5 },
          snContext,
        );
      }
    } catch (error) {
      console.error(`[CMDB Orchestrator] Error searching for ${entityValue}:`, error);
      return [];
    }
  }

  /**
   * Link CI to case using existing ServiceNowClient
   */
  private async linkCiToCase(caseSysId: string, ci: any, snContext: any): Promise<void> {
    try {
      const workNote = `CMDB Reconciliation: Linked Configuration Item "${ci.name}" (${ci.sys_class_name}) to this case.\n` +
        `CI Details: ${ci.url}\n` +
        `IP Addresses: ${ci.ip_addresses?.join(", ") || "None"}\n` +
        `Owner Group: ${ci.owner_group || "Not specified"}`;

      await this.serviceNowClient.addCaseWorkNote(caseSysId, workNote, true, snContext);
      console.log(`[CMDB Orchestrator] Linked CI ${ci.name} to case ${caseSysId}`);
    } catch (error) {
      console.error(`[CMDB Orchestrator] Error linking CI to case:`, error);
      throw error;
    }
  }

  /**
   * Create child task for missing CI using existing logic
   */
  private async createChildTaskForMissingCi(
    reconciliationId: number,
    caseSysId: string,
    caseNumber: string,
    originalEntity: string,
    resolvedEntity: string
  ): Promise<SideEffectResult> {
    try {
      const reconciliation = await this.repository.findById(reconciliationId);
      if (!reconciliation) {
        throw new Error(`Reconciliation record ${reconciliationId} not found`);
      }

      const taskDescription = `A configuration item referenced in this case does not exist in the CMDB.

Original Entity: ${originalEntity}
Resolved Entity: ${resolvedEntity}

Please investigate and create the appropriate Configuration Item in the CMDB. Once created, link it to this parent case.

Entity Type: ${reconciliation.entityType}
Detection Confidence: ${reconciliation.confidence}

This task was automatically generated by the CMDB Reconciliation system.`;

      const task = await this.serviceNowClient.createChildTask(
        {
          caseSysId: caseSysId,
          caseNumber: caseNumber,
          description: taskDescription,
          assignmentGroup: config.cmdbReconciliationAssignmentGroup,
          shortDescription: `Create CMDB CI: ${resolvedEntity}`,
          priority: "3",
        },
      );

      // Update the reconciliation record with task details
      await this.repository.updateWithChildTask(reconciliationId, {
        childTaskNumber: task.number,
        childTaskSysId: task.sys_id,
      });

      // Send Slack notification using existing service
      if (config.cmdbReconciliationSlackChannel) {
        await this.sendSlackNotification(caseNumber, task.number, originalEntity, resolvedEntity);
      }

      console.log(`[CMDB Orchestrator] Created child task ${task.number} for missing CI: ${resolvedEntity}`);
      
      return {
        taskCreated: {
          taskNumber: task.number,
          taskSysId: task.sys_id,
        },
      };
    } catch (error) {
      console.error(`[CMDB Orchestrator] Error creating child task:`, error);
      throw error;
    }
  }

  /**
   * Send Slack notification using existing SlackMessagingService
   */
  private async sendSlackNotification(
    caseNumber: string,
    taskNumber: string,
    originalEntity: string,
    resolvedEntity: string
  ): Promise<void> {
    try {
      const message = `🔍 *CMDB Alert: Missing Configuration Item*

A case has referenced a configuration item that doesn't exist in the CMDB.

*Case:* ${caseNumber}
*Child Task:* ${taskNumber}
*Entity:* ${originalEntity}
*Resolved Entity:* ${resolvedEntity}

A child task has been created and assigned to *${config.cmdbReconciliationAssignmentGroup}* to investigate and create the appropriate CI.

Please review and update the CMDB to maintain data quality.`;

      await this.slackMessaging.postMessage({
        channel: config.cmdbReconciliationSlackChannel!,
        text: message,
      });

      console.log(`[CMDB Orchestrator] Sent Slack notification to ${config.cmdbReconciliationSlackChannel}`);
    } catch (error) {
      console.error(`[CMDB Orchestrator] Error sending Slack notification:`, error);
      // Don't throw - notification failure shouldn't break the reconciliation process
    }
  }

  /**
   * Flatten entities object into array
   * Reuses existing logic from original service
   */
  private flattenEntities(entities: {
    ip_addresses: string[];
    systems: string[];
    users: string[];
    software: string[];
    error_codes: string[];
    network_devices: string[];
  }): EntityInput[] {
    const flattened: EntityInput[] = [];

    for (const ip of entities.ip_addresses) {
      flattened.push({ value: ip, type: "IP_ADDRESS", caseNumber: "", caseSysId: "" });
    }

    for (const system of entities.systems) {
      flattened.push({ value: system, type: "SYSTEM", caseNumber: "", caseSysId: "" });
    }

    for (const user of entities.users) {
      flattened.push({ value: user, type: "USER", caseNumber: "", caseSysId: "" });
    }

    for (const software of entities.software) {
      flattened.push({ value: software, type: "SOFTWARE", caseNumber: "", caseSysId: "" });
    }

    for (const errorCode of entities.error_codes) {
      flattened.push({ value: errorCode, type: "ERROR_CODE", caseNumber: "", caseSysId: "" });
    }

    for (const networkDevice of entities.network_devices) {
      flattened.push({ value: networkDevice, type: "NETWORK_DEVICE", caseNumber: "", caseSysId: "" });
    }

    return flattened;
  }

  /**
   * Get reconciliation statistics for a case
   * Delegates to existing repository
   */
  async getCaseStatistics(caseNumber: string): Promise<ProcessingStats> {
    return await this.repository.getCaseStatistics(caseNumber);
  }

  /**
   * Get recent reconciliation results
   * Delegates to existing repository
   */
  async getRecentResults(limit: number = 50): Promise<CmdbReconciliationResult[]> {
    return await this.repository.getRecent(limit);
  }

  /**
   * Get unmatched entities that need CI creation
   * Delegates to existing repository
   */
  async getUnmatchedEntities(limit: number = 20): Promise<CmdbReconciliationResult[]> {
    return await this.repository.getUnmatchedEntities(limit);
  }
}