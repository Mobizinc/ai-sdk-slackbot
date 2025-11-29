/**
 * Case Search Pagination Service
 *
 * Manages pagination state for case search results using hybrid approach:
 * - Simple filters: Encoded in button values (stateless)
 * - Complex filters: Stored in database via WorkflowManager (stateful)
 *
 * Benefits:
 * - No state management for simple searches (fast, scalable)
 * - Database fallback for complex searches (reliable)
 * - Automatic cleanup via workflow expiration
 */

import { workflowManager } from "./workflow-manager";
import type { CaseSearchFilters } from "./case-search-service";

const MAX_ENCODED_LENGTH = 70; // Slack button value limit is 75 chars
const WORKFLOW_TYPE_CASE_SEARCH = "CASE_SEARCH_PAGINATION";

/**
 * Simplified pagination state for encoding
 */
interface SimplePaginationState {
  c?: string; // customer (truncated)
  q?: string; // queue (truncated)
  a?: string; // assignedTo (truncated)
  p?: string; // priority
  s?: string; // state
  o: number; // offset
  l: number; // limit
}

/**
 * Pagination Service
 */
export class CaseSearchPagination {
  /**
   * Encode search state for button value (hybrid approach)
   * Returns either base64-encoded state OR search_id
   */
  async encodeState(
    filters: CaseSearchFilters,
    offset: number,
    userId: string
  ): Promise<string> {
    if (!workflowManager) {
        console.warn("[Pagination] WorkflowManager not available. Using stateless encoding only.");
        // Fallback to simple encoding even if it's too long, might fail but won't crash.
        const simpleState = this.buildSimpleState(filters, offset);
        return `s:${this.encodeSimpleState(simpleState)}`;
    }
    // Try simple encoding first
    const simpleState = this.buildSimpleState(filters, offset);
    const encoded = this.encodeSimpleState(simpleState);

    if (encoded.length <= MAX_ENCODED_LENGTH) {
      // Success - use stateless approach
      return `s:${encoded}`; // Prefix 's:' indicates simple/stateless
    }

    // Too complex - use database approach
    const searchId = this.generateSearchId();

    await workflowManager.start({
        workflowType: WORKFLOW_TYPE_CASE_SEARCH,
        workflowReferenceId: searchId,
        initialState: 'ACTIVE',
        payload: {
            filters: filters as any,
            currentOffset: offset,
            totalResults: 0, // Not available at encode time
            userId,
        },
        expiresInSeconds: 3600 // 1 hour expiration
    });

    return `d:${searchId}`; // Prefix 'd:' indicates database/stateful
  }

  /**
   * Decode search state from button value
   */
  async decodeState(
    encodedValue: string,
    userId: string
  ): Promise<{ filters: CaseSearchFilters; offset: number } | null> {
    if (!encodedValue) {
      return null;
    }

    // Check prefix
    if (encodedValue.startsWith('s:')) {
      // Simple/stateless encoding
      return this.decodeSimpleState(encodedValue.substring(2));
    }

    if (encodedValue.startsWith('d:')) {
      // Database/stateful encoding
      const searchId = encodedValue.substring(2);
      return await this.decodeFromDatabase(searchId, userId);
    }

    // Legacy format (no prefix) - try simple decode
    return this.decodeSimpleState(encodedValue);
  }

  /**
   * Build simplified state for encoding
   */
  private buildSimpleState(
    filters: CaseSearchFilters,
    offset: number
  ): SimplePaginationState {
    return {
      c: filters.accountName?.substring(0, 20),
      q: filters.assignmentGroup?.substring(0, 20),
      a: filters.assignedTo?.substring(0, 20),
      p: filters.priority,
      s: filters.state,
      o: offset,
      l: filters.limit || 10,
    };
  }

  /**
   * Encode simple state to base64
   */
  private encodeSimpleState(state: SimplePaginationState): string {
    try {
      const json = JSON.stringify(state);
      return btoa(json);
    } catch (error) {
      console.error('[Pagination] Failed to encode state:', error);
      return '';
    }
  }

  /**
   * Decode simple state from base64
   */
  private decodeSimpleState(encoded: string): { filters: CaseSearchFilters; offset: number } | null {
    try {
      const json = atob(encoded);
      const simple: SimplePaginationState = JSON.parse(json);

      // Reconstruct full filters
      const filters: CaseSearchFilters = {
        accountName: simple.c,
        assignmentGroup: simple.q,
        assignedTo: simple.a,
        priority: simple.p,
        state: simple.s,
        limit: simple.l,
        offset: simple.o,
      };

      return { filters, offset: simple.o };
    } catch (error) {
      console.error('[Pagination] Failed to decode simple state:', error);
      return null;
    }
  }

  /**
   * Decode state from database
   */
  private async decodeFromDatabase(
    searchId: string,
    userId: string
  ): Promise<{ filters: CaseSearchFilters; offset: number } | null> {
    if (!workflowManager) {
        console.warn("[Pagination] WorkflowManager not available. Cannot decode from database.");
        return null;
    }
    try {
      const workflow = await workflowManager.findActiveByReferenceId(WORKFLOW_TYPE_CASE_SEARCH, searchId);

      if (!workflow) {
        console.warn('[Pagination] Search workflow not found in database:', searchId);
        return null;
      }
      
      const payload = workflow.payload as any;

      return {
        filters: payload.filters as CaseSearchFilters,
        offset: payload.currentOffset,
      };
    } catch (error) {
      console.error('[Pagination] Failed to decode from database:', error);
      return null;
    }
  }

  /**
   * Generate unique search ID
   */
  private generateSearchId(): string {
    return `search_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Check if filters are simple enough to encode
   */
  isSimpleSearch(filters: CaseSearchFilters): boolean {
    const simpleState = this.buildSimpleState(filters, filters.offset || 0);
    const encoded = this.encodeSimpleState(simpleState);
    return encoded.length <= MAX_ENCODED_LENGTH;
  }
}

// Global singleton instance
let paginationService: CaseSearchPagination | null = null;

/**
 * Get singleton instance of Case Search Pagination
 */
export function getCaseSearchPagination(): CaseSearchPagination {
  if (!paginationService) {
    paginationService = new CaseSearchPagination();
  }

  return paginationService;
}