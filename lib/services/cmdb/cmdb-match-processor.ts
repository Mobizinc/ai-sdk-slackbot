/**
 * CMDB Match Processor
 * 
 * Pure business logic for processing CMDB search results.
 * Contains no side effects - only match analysis and decision making.
 */

import type { ServiceNowConfigurationItem } from "../../tools/servicenow";
import type { MatchResult } from "./types";

export class CmdbMatchProcessor {
  /**
   * Process CMDB search results and determine reconciliation action
   * 
   * This method contains pure business logic - no side effects.
   * It analyzes search results and determines what action should be taken.
   */
  async processMatches(
    matches: ServiceNowConfigurationItem[],
    entityValue: string,
    entityType: string
  ): Promise<MatchResult> {
    if (matches.length === 0) {
      return {
        action: 'create_task',
        confidence: 0.0,
        details: `No CMDB match found for ${entityType}: ${entityValue}`,
      };
    }

    if (matches.length === 1) {
      const match = matches[0];
      const confidence = this.calculateConfidence(match, entityValue, entityType);
      
      return {
        action: 'link_ci',
        match,
        confidence,
        details: `Exact match found: ${match.name} (${match.sys_class_name})`,
      };
    }

    // Multiple matches - ambiguous
    return {
      action: 'ambiguous',
      confidence: 0.3,
      details: `Found ${matches.length} matches for ${entityType}: ${entityValue}: ` +
        matches.map(m => m.name).join(', '),
    };
  }

  /**
   * Calculate confidence score for a CMDB match
   * 
   * Higher confidence for exact name matches and relevant CI classes
   */
  private calculateConfidence(
    match: ServiceNowConfigurationItem,
    entityValue: string,
    entityType: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Exact name match increases confidence
    if (match.name.toLowerCase() === entityValue.toLowerCase()) {
      confidence += 0.3;
    }

    // Partial name match
    if (match.name.toLowerCase().includes(entityValue.toLowerCase()) ||
        entityValue.toLowerCase().includes(match.name.toLowerCase())) {
      confidence += 0.1;
    }

    // Relevant CI class for entity type
    if (this.isRelevantCiClass(match.sys_class_name, entityType)) {
      confidence += 0.1;
    }

    // IP address specific logic
    if (entityType === 'IP_ADDRESS' && match.ip_addresses?.length > 0) {
      if (match.ip_addresses.includes(entityValue)) {
        confidence += 0.2;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Check if CI class is relevant for entity type
   */
  private isRelevantCiClass(ciClass: string | undefined, entityType: string): boolean {
    if (!ciClass) return false;

    const relevantClasses = {
      'IP_ADDRESS': ['cmdb_ci_ip_address', 'cmdb_ci_network_adapter'],
      'SYSTEM': ['cmdb_ci_server', 'cmdb_ci_computer', 'cmdb_ci_linux_server', 'cmdb_ci_windows_server'],
      'SOFTWARE': ['cmdb_ci_app', 'cmdb_ci_software', 'cmdb_ci_spkg'],
      'NETWORK_DEVICE': ['cmdb_ci_net_device', 'cmdb_ci_firewall', 'cmdb_ci_router', 'cmdb_ci_switch'],
    };

    const classes = relevantClasses[entityType as keyof typeof relevantClasses];
    return classes ? classes.includes(ciClass) : false;
  }

  /**
   * Determine if processing should continue based on match result
   */
  shouldContinueProcessing(matchResult: MatchResult): boolean {
    return matchResult.action !== 'skip';
  }

  /**
   * Validate match result integrity
   */
  validateMatchResult(matchResult: MatchResult): boolean {
    if (!matchResult.action || !Object.values(['link_ci', 'create_task', 'ambiguous', 'skip']).includes(matchResult.action)) {
      return false;
    }

    if (matchResult.action === 'link_ci' && !matchResult.match) {
      return false;
    }

    if (typeof matchResult.confidence !== 'number' || matchResult.confidence < 0 || matchResult.confidence > 1) {
      return false;
    }

    return true;
  }
}