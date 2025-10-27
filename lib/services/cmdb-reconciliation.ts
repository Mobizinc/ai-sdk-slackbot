import { ServiceNowClient, ServiceNowConfigurationItem } from "../tools/servicenow";
import { getCmdbReconciliationRepository } from "../db/repositories/cmdb-reconciliation-repository";
import { getBusinessContextService } from "./business-context";
import { CmdbReconciliationResult } from "../db/schema";
import { getSlackMessagingService } from "./slack-messaging";
import { config } from "../config";
import { createSystemContext } from "../infrastructure/servicenow-context";

const slackMessaging = getSlackMessagingService();

export interface ReconciliationInput {
  caseNumber: string;
  caseSysId: string;
  entities: {
    ip_addresses: string[];
    systems: string[];
    users: string[];
    software: string[];
    error_codes: string[];
    network_devices: string[];
  };
}

export interface ReconciliationResult {
  caseNumber: string;
  totalEntities: number;
  matched: number;
  unmatched: number;
  skipped: number;
  ambiguous: number;
  results: CmdbReconciliationResult[];
}

export interface EntityResolutionResult {
  originalValue: string;
  resolvedValue: string | null;
  businessContextMatch?: string;
  isAliasResolved: boolean;
}

export interface CmdbContextMatch {
  businessContextName: string;
  ciName?: string;
  ciSysId?: string;
  ipAddresses?: string[];
}

export class CmdbReconciliationService {
  private serviceNowClient: ServiceNowClient;
  private repository = getCmdbReconciliationRepository();
  private businessContextService = getBusinessContextService();

  constructor() {
    this.serviceNowClient = new ServiceNowClient();
  }

  /**
   * Main reconciliation method - processes all entities for a case
   */
  async reconcileEntities(input: ReconciliationInput): Promise<ReconciliationResult> {
    console.log(`[CMDB] Starting reconciliation for case ${input.caseNumber}`);

    // Create ServiceNow context for system operation (deterministic routing)
    const snContext = createSystemContext('cmdb-reconciliation');

    const allEntities = this.flattenEntities(input.entities);
    const results: CmdbReconciliationResult[] = [];

    for (const entity of allEntities) {
      try {
        const result = await this.reconcileEntity(input.caseNumber, input.caseSysId, entity, snContext);
        results.push(result);
      } catch (error) {
        console.error(`[CMDB] Error reconciling entity ${entity.value}:`, error);
        // Create error record
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
    
    console.log(`[CMDB] Reconciliation complete for case ${input.caseNumber}:`, stats);
    
    return {
      caseNumber: input.caseNumber,
      totalEntities: allEntities.length,
      ...stats,
      results,
    };
  }

  /**
   * Reconcile a single entity
   */
  private async reconcileEntity(
    caseNumber: string,
    caseSysId: string,
    entity: { value: string; type: string },
    snContext: any, // ServiceNowContext
  ): Promise<CmdbReconciliationResult> {
    // Step 1: Resolve entity aliases using BusinessContext
    const resolution = await this.resolveEntityAlias(entity.value, entity.type);
    
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

    // Step 2: Search CMDB for the resolved entity
    const cmdbMatches = await this.searchCmdb(resolution.resolvedValue, entity.type, snContext);
    
    // Create initial record
    const record = await this.repository.create({
      caseNumber,
      caseSysId,
      entityValue: entity.value,
      entityType: entity.type,
      originalEntityValue: entity.value,
      resolvedEntityValue: resolution.resolvedValue,
      reconciliationStatus: "matched", // Will be updated if needed
      confidence: 0.8, // Default confidence
      businessContextMatch: resolution.businessContextMatch,
      metadata: {
        searchValue: resolution.resolvedValue,
        matchCount: cmdbMatches.length,
      },
    });

    // Step 3: Process CMDB matches
    if (cmdbMatches.length === 0) {
      // No match found - create child task
      await this.createChildTaskForMissingCi(record.id, caseSysId, caseNumber, entity.value, resolution.resolvedValue, snContext);
      return await this.repository.markAsSkipped(record.id, "No CMDB match found - child task created");
    } else if (cmdbMatches.length === 1) {
      // Exact match found - link CI to case
      const match = cmdbMatches[0];
      await this.linkCiToCase(caseSysId, match);
      return await this.repository.updateWithMatch(record.id, {
        cmdbSysId: match.sys_id,
        cmdbName: match.name,
        cmdbClass: match.sys_class_name,
        cmdbUrl: match.url,
        confidence: 0.9,
      });
    } else {
      // Multiple matches - ambiguous
      return await this.repository.markAsAmbiguous(record.id, 
        `Found ${cmdbMatches.length} matches: ${cmdbMatches.map(m => m.name).join(", ")}`
      );
    }
  }

  /**
   * Resolve entity aliases using BusinessContext
   */
  private async resolveEntityAlias(
    entityValue: string,
    entityType: string
  ): Promise<EntityResolutionResult> {
    // Skip non-CI-worthy entities
    if (!this.isCiWorthyEntity(entityType)) {
      return {
        originalValue: entityValue,
        resolvedValue: null,
        isAliasResolved: false,
      };
    }

    // Search business contexts for alias matches
    const contexts = await this.businessContextService.searchContextsByEntity(entityValue);
    
    if (contexts.length === 0) {
      // No business context match - use original value
      return {
        originalValue: entityValue,
        resolvedValue: entityValue,
        isAliasResolved: true,
      };
    }

    // Find exact alias match
    for (const context of contexts) {
      const aliasMatch = this.findAliasMatch(entityValue, context);
      if (aliasMatch) {
        return {
          originalValue: entityValue,
          resolvedValue: aliasMatch.ciName || context.entityName,
          businessContextMatch: context.entityName,
          isAliasResolved: true,
        };
      }
    }

    // No exact alias match - use original value
    return {
      originalValue: entityValue,
      resolvedValue: entityValue,
      isAliasResolved: true,
    };
  }

  /**
   * Find alias match in business context
   */
  private findAliasMatch(entityValue: string, context: any): CmdbContextMatch | null {
    // Check if entityValue matches any alias
    const matchingAlias = context.aliases?.find((alias: string) => 
      alias.toLowerCase() === entityValue.toLowerCase()
    );

    if (matchingAlias) {
      return {
        businessContextName: context.entityName,
        ciName: context.cmdbIdentifiers?.[0]?.ciName,
        ciSysId: context.cmdbIdentifiers?.[0]?.sysId,
        ipAddresses: context.cmdbIdentifiers?.[0]?.ipAddresses,
      };
    }

    // Check if entityValue matches the main entity name
    if (context.entityName.toLowerCase() === entityValue.toLowerCase()) {
      return {
        businessContextName: context.entityName,
        ciName: context.cmdbIdentifiers?.[0]?.ciName,
        ciSysId: context.cmdbIdentifiers?.[0]?.sysId,
        ipAddresses: context.cmdbIdentifiers?.[0]?.ipAddresses,
      };
    }

    return null;
  }

  /**
   * Search CMDB for configuration items
   */
  private async searchCmdb(
    entityValue: string,
    entityType: string,
    snContext: any, // ServiceNowContext from caller
  ): Promise<ServiceNowConfigurationItem[]> {
    try {
      if (entityType === "IP_ADDRESS") {
        return await this.serviceNowClient.searchConfigurationItems(
          {
            ipAddress: entityValue,
            limit: 5,
          },
          snContext,
        );
      } else if (entityType === "NETWORK_DEVICE") {
        // Search for network devices (firewalls, routers, switches)
        // The searchConfigurationItems method will search across name, fqdn, u_fqdn, host_name
        // This covers most network device naming patterns
        return await this.serviceNowClient.searchConfigurationItems(
          {
            name: entityValue,
            limit: 5,
          },
          snContext,
        );
      } else {
        return await this.serviceNowClient.searchConfigurationItems(
          {
            name: entityValue,
            limit: 5,
          },
          snContext,
        );
      }
    } catch (error) {
      console.error(`[CMDB] Error searching for ${entityValue}:`, error);
      return [];
    }
  }

  /**
   * Link CI to case
   */
  private async linkCiToCase(
    caseSysId: string,
    ci: ServiceNowConfigurationItem
  ): Promise<void> {
    try {
      // Add work note with CI information
      const workNote = `CMDB Reconciliation: Linked Configuration Item "${ci.name}" (${ci.sys_class_name}) to this case.\n` +
        `CI Details: ${ci.url}\n` +
        `IP Addresses: ${ci.ip_addresses.join(", ") || "None"}\n` +
        `Owner Group: ${ci.owner_group || "Not specified"}`;

      // Use system context for CMDB operations (deterministic routing)
      const snContext = createSystemContext('cmdb-reconciliation');
      await this.serviceNowClient.addCaseWorkNote(caseSysId, workNote, true, snContext);

      console.log(`[CMDB] Linked CI ${ci.name} to case ${caseSysId}`);
    } catch (error) {
      console.error(`[CMDB] Error linking CI to case:`, error);
      throw error;
    }
  }

  /**
   * Create child task for missing CI
   */
  private async createChildTaskForMissingCi(
    reconciliationId: number,
    caseSysId: string,
    caseNumber: string,
    originalEntity: string,
    resolvedEntity: string,
    snContext: any, // ServiceNowContext
  ): Promise<void> {
    try {
      // Get the reconciliation record to find the case
      const reconciliation = await this.repository.findById(reconciliationId);
      if (!reconciliation) {
        throw new Error(`Reconciliation record ${reconciliationId} not found`);
      }

      // Create child task in ServiceNow
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
          priority: "3", // High priority for missing CI
        },
        snContext,
      );

      // Update the reconciliation record with task details
      await this.repository.updateWithChildTask(reconciliationId, {
        childTaskNumber: task.number,
        childTaskSysId: task.sys_id,
      });

      // Send Slack notification if configured
      if (config.cmdbReconciliationSlackChannel) {
        await this.sendSlackNotification(caseNumber, task.number, originalEntity, resolvedEntity);
      }

      console.log(`[CMDB] Created child task ${task.number} for missing CI: ${resolvedEntity}`);
    } catch (error) {
      console.error(`[CMDB] Error creating child task:`, error);
      throw error;
    }
  }

  /**
   * Send Slack notification for missing CI
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

      await slackMessaging.postMessage({
        channel: config.cmdbReconciliationSlackChannel,
        text: message,
      });

      console.log(`[CMDB] Sent Slack notification to ${config.cmdbReconciliationSlackChannel}`);
    } catch (error) {
      console.error(`[CMDB] Error sending Slack notification:`, error);
      // Don't throw - notification failure shouldn't break the reconciliation process
    }
  }

  /**
   * Check if entity type is CI-worthy
   */
  private isCiWorthyEntity(entityType: string): boolean {
    const ciWorthyTypes = ["IP_ADDRESS", "SYSTEM", "SOFTWARE", "NETWORK_DEVICE"];
    return ciWorthyTypes.includes(entityType);
  }

  /**
   * Flatten entities object into array
   */
  private flattenEntities(entities: {
    ip_addresses: string[];
    systems: string[];
    users: string[];
    software: string[];
    error_codes: string[];
    network_devices: string[];
  }): Array<{ value: string; type: string }> {
    const flattened: Array<{ value: string; type: string }> = [];

    for (const ip of entities.ip_addresses) {
      flattened.push({ value: ip, type: "IP_ADDRESS" });
    }

    for (const system of entities.systems) {
      flattened.push({ value: system, type: "SYSTEM" });
    }

    for (const user of entities.users) {
      flattened.push({ value: user, type: "USER" });
    }

    for (const software of entities.software) {
      flattened.push({ value: software, type: "SOFTWARE" });
    }

    for (const errorCode of entities.error_codes) {
      flattened.push({ value: errorCode, type: "ERROR_CODE" });
    }

    for (const networkDevice of entities.network_devices) {
      flattened.push({ value: networkDevice, type: "NETWORK_DEVICE" });
    }

    return flattened;
  }

  /**
   * Get reconciliation statistics for a case
   */
  async getCaseStatistics(caseNumber: string): Promise<{
    total: number;
    matched: number;
    unmatched: number;
    skipped: number;
    ambiguous: number;
  }> {
    return await this.repository.getCaseStatistics(caseNumber);
  }

  /**
   * Get recent reconciliation results
   */
  async getRecentResults(limit: number = 50): Promise<CmdbReconciliationResult[]> {
    return await this.repository.getRecent(limit);
  }

  /**
   * Get unmatched entities that need CI creation
   */
  async getUnmatchedEntities(limit: number = 20): Promise<CmdbReconciliationResult[]> {
    return await this.repository.getUnmatchedEntities(limit);
  }
}

// Singleton instance
let cmdbReconciliationService: CmdbReconciliationService | null = null;

export function getCmdbReconciliationService(): CmdbReconciliationService {
  if (!cmdbReconciliationService) {
    cmdbReconciliationService = new CmdbReconciliationService();
  }
  return cmdbReconciliationService;
}