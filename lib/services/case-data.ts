/**
 * Case Data Service
 *
 * High-level service for fetching and working with ServiceNow case data.
 * Provides convenient methods that abstract common patterns.
 *
 * Benefits:
 * - Single place for case data operations
 * - Consistent error handling
 * - Easier to mock in tests
 * - Higher-level API than raw ServiceNow client
 */

import { serviceNowClient } from '../tools/servicenow';
import type {
  ServiceNowCaseResult,
  ServiceNowCaseJournalEntry,
} from '../tools/servicenow';

export interface CaseWithJournal {
  case: ServiceNowCaseResult;
  journal: ServiceNowCaseJournalEntry[];
}

export interface CaseSearchFilters {
  state?: string;
  priority?: string;
  assignedTo?: string;
  company?: string;
  limit?: number;
}

/**
 * Case Data Service
 * Provides high-level operations for working with ServiceNow cases
 */
export class CaseDataService {
  constructor(private client: typeof serviceNowClient = serviceNowClient) {}

  /**
   * Check if ServiceNow is configured
   */
  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  /**
   * Get a case by case number
   * Returns null if not found or ServiceNow not configured
   */
  async getCase(caseNumber: string): Promise<ServiceNowCaseResult | null> {
    if (!this.isConfigured()) {
      console.warn(
        `[Case Data] ServiceNow not configured - cannot fetch case ${caseNumber}`
      );
      return null;
    }

    try {
      return await this.client.getCase(caseNumber);
    } catch (error) {
      console.error(`[Case Data] Failed to fetch case ${caseNumber}:`, error);
      return null;
    }
  }

  /**
   * Get a case by sys_id
   * Returns null if not found or ServiceNow not configured
   */
  async getCaseBySysId(sysId: string): Promise<ServiceNowCaseResult | null> {
    if (!this.isConfigured()) {
      console.warn(
        `[Case Data] ServiceNow not configured - cannot fetch case ${sysId}`
      );
      return null;
    }

    try {
      return await this.client.getCaseBySysId(sysId);
    } catch (error) {
      console.error(`[Case Data] Failed to fetch case by sys_id ${sysId}:`, error);
      return null;
    }
  }

  /**
   * Get case journal entries
   * Returns empty array if not found or ServiceNow not configured
   */
  async getCaseJournal(
    caseSysId: string,
    options?: { limit?: number }
  ): Promise<ServiceNowCaseJournalEntry[]> {
    if (!this.isConfigured()) {
      console.warn(
        `[Case Data] ServiceNow not configured - cannot fetch journal for ${caseSysId}`
      );
      return [];
    }

    try {
      return await this.client.getCaseJournal(caseSysId, options);
    } catch (error) {
      console.error(
        `[Case Data] Failed to fetch journal for case ${caseSysId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Get case with journal entries in one call
   * Convenience method to fetch both case and journal
   */
  async getCaseWithJournal(
    caseNumber: string,
    options?: { journalLimit?: number }
  ): Promise<CaseWithJournal | null> {
    const caseData = await this.getCase(caseNumber);

    if (!caseData) {
      return null;
    }

    const journal = await this.getCaseJournal(caseData.sys_id, {
      limit: options?.journalLimit,
    });

    return {
      case: caseData,
      journal,
    };
  }

  /**
   * Check if a case is in a resolved state
   * Returns false if case not found or ServiceNow not configured
   */
  async isResolved(caseNumber: string): Promise<boolean> {
    const caseData = await this.getCase(caseNumber);

    if (!caseData) {
      return false;
    }

    // Common resolved states in ServiceNow
    const resolvedStates = ['Resolved', 'Closed', 'Cancelled'];
    const state = caseData.state || '';

    return resolvedStates.includes(state);
  }

  /**
   * Safely get case data (returns null on error, never throws)
   * Useful for non-critical lookups where you don't want to fail the flow
   */
  async getCaseSafely(caseNumber: string): Promise<ServiceNowCaseResult | null> {
    try {
      return await this.getCase(caseNumber);
    } catch (error) {
      // Already logged in getCase, just return null
      return null;
    }
  }

  /**
   * Get multiple cases by case numbers
   * Returns a map of caseNumber -> case (or null if not found)
   */
  async getCases(
    caseNumbers: string[]
  ): Promise<Map<string, ServiceNowCaseResult | null>> {
    const results = new Map<string, ServiceNowCaseResult | null>();

    // Fetch all cases in parallel
    const promises = caseNumbers.map(async (caseNumber) => {
      const caseData = await this.getCaseSafely(caseNumber);
      results.set(caseNumber, caseData);
    });

    await Promise.all(promises);

    return results;
  }
}

// Singleton instance
let caseDataService: CaseDataService | null = null;

/**
 * Get the case data service singleton
 */
export function getCaseDataService(): CaseDataService {
  if (!caseDataService) {
    caseDataService = new CaseDataService();
  }
  return caseDataService;
}

/**
 * Reset the service instance (for testing)
 */
export function __resetCaseDataService(): void {
  caseDataService = null;
}

/**
 * Set a custom service instance (for testing)
 */
export function __setCaseDataService(service: CaseDataService): void {
  caseDataService = service;
}
