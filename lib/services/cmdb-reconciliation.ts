/**
 * CMDB Reconciliation Service (Thin Facade)
 * 
 * Refactored to delegate all functionality to new modular architecture.
 * Maintains backward compatibility while using new orchestrator internally.
 */

import { ReconciliationOrchestrator } from "./cmdb/reconciliation-orchestrator";
import type { 
  ReconciliationInput, 
  ReconciliationResult
} from "./cmdb/types";

// Re-export types for backward compatibility
export type { 
  ReconciliationInput, 
  ReconciliationResult,
  EntityResolutionResult,
  CmdbContextMatch 
} from "./cmdb/types";

export class CmdbReconciliationService {
  private orchestrator = new ReconciliationOrchestrator();

  /**
   * Main reconciliation method - delegates to orchestrator
   */
  async reconcileEntities(input: ReconciliationInput): Promise<ReconciliationResult> {
    return await this.orchestrator.reconcileEntities(input);
  }

  /**
   * Get reconciliation statistics for a case - delegates to orchestrator
   */
  async getCaseStatistics(caseNumber: string): Promise<{
    total: number;
    matched: number;
    unmatched: number;
    skipped: number;
    ambiguous: number;
  }> {
    return await this.orchestrator.getCaseStatistics(caseNumber);
  }

  /**
   * Get recent reconciliation results - delegates to orchestrator
   */
  async getRecentResults(limit: number = 50): Promise<any[]> {
    return await this.orchestrator.getRecentResults(limit);
  }

  /**
   * Get unmatched entities that need CI creation - delegates to orchestrator
   */
  async getUnmatchedEntities(limit: number = 20): Promise<any[]> {
    return await this.orchestrator.getUnmatchedEntities(limit);
  }
}

// Singleton instance for backward compatibility
let cmdbReconciliationService: CmdbReconciliationService | null = null;

export function getCmdbReconciliationService(): CmdbReconciliationService {
  if (!cmdbReconciliationService) {
    cmdbReconciliationService = new CmdbReconciliationService();
  }
  return cmdbReconciliationService;
}