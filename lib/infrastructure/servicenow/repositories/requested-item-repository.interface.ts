/**
 * Requested Item Repository Interface
 *
 * Provides a collection-oriented interface for RequestedItem (sc_req_item) operations
 */

import type { RequestedItem, RequestedItemSearchCriteria } from "../types/domain-models";

/**
 * Repository interface for RequestedItem entity operations
 */
export interface RequestedItemRepository {
  /**
   * Find a requested item by its number (e.g., "RITM0046210")
   */
  findByNumber(number: string): Promise<RequestedItem | null>;

  /**
   * Find a requested item by its sys_id
   */
  findBySysId(sysId: string): Promise<RequestedItem | null>;

  /**
   * Search for requested items matching the provided criteria
   */
  search(criteria: RequestedItemSearchCriteria): Promise<{ items: RequestedItem[]; totalCount: number }>;

  /**
   * Find requested items for a specific request (parent)
   */
  findByRequest(requestSysId: string, limit?: number): Promise<RequestedItem[]>;

  /**
   * Find requested items by catalog item
   */
  findByCatalogItem(catalogItemSysId: string, limit?: number): Promise<RequestedItem[]>;

  /**
   * Find requested items in a specific state
   */
  findByState(state: string, limit?: number): Promise<RequestedItem[]>;
}
