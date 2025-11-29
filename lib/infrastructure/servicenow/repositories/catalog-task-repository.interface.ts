/**
 * Catalog Task Repository Interface
 *
 * Provides a collection-oriented interface for CatalogTask (sc_task) operations
 */

import type { CatalogTask, CatalogTaskSearchCriteria } from "../types/domain-models";

/**
 * Repository interface for CatalogTask entity operations
 */
export interface CatalogTaskRepository {
  /**
   * Find a catalog task by its number (e.g., "CTASK0049921")
   */
  findByNumber(number: string): Promise<CatalogTask | null>;

  /**
   * Find a catalog task by its sys_id
   */
  findBySysId(sysId: string): Promise<CatalogTask | null>;

  /**
   * Search for catalog tasks matching the provided criteria
   */
  search(criteria: CatalogTaskSearchCriteria): Promise<{ tasks: CatalogTask[]; totalCount: number }>;

  /**
   * Find catalog tasks for a specific requested item (parent)
   */
  findByRequestedItem(requestedItemSysId: string, limit?: number): Promise<CatalogTask[]>;

  /**
   * Find catalog tasks for a specific request (grandparent)
   */
  findByRequest(requestSysId: string, limit?: number): Promise<CatalogTask[]>;

  /**
   * Find catalog tasks in a specific state
   */
  findByState(state: string, limit?: number): Promise<CatalogTask[]>;

  /**
   * Find active catalog tasks
   */
  findActive(limit?: number): Promise<CatalogTask[]>;
}
