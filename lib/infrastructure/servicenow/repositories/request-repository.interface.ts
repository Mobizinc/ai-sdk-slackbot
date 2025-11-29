/**
 * Request Repository Interface
 *
 * Provides a collection-oriented interface for Request (sc_request) operations
 */

import type { Request, RequestSearchCriteria } from "../types/domain-models";

/**
 * Repository interface for Request entity operations
 */
export interface RequestRepository {
  /**
   * Find a request by its number (e.g., "REQ0043549")
   */
  findByNumber(number: string): Promise<Request | null>;

  /**
   * Find a request by its sys_id
   */
  findBySysId(sysId: string): Promise<Request | null>;

  /**
   * Search for requests matching the provided criteria
   */
  search(criteria: RequestSearchCriteria): Promise<{ requests: Request[]; totalCount: number }>;

  /**
   * Find requests for a specific user
   */
  findByRequestedFor(userSysId: string, limit?: number): Promise<Request[]>;

  /**
   * Find requests in a specific state
   */
  findByState(state: string, limit?: number): Promise<Request[]>;
}
