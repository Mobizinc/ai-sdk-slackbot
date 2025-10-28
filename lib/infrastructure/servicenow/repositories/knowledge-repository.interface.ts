/**
 * Knowledge Repository Interface
 *
 * Provides a collection-oriented interface for Knowledge Base operations
 */

import type { KnowledgeArticle } from "../types/domain-models";

/**
 * Repository interface for Knowledge Base entity operations
 */
export interface KnowledgeRepository {
  /**
   * Search for knowledge articles by text query
   */
  search(query: string, limit?: number): Promise<KnowledgeArticle[]>;

  /**
   * Find a knowledge article by its number (e.g., "KB0001234")
   */
  findByNumber(number: string): Promise<KnowledgeArticle | null>;

  /**
   * Find a knowledge article by its sys_id
   */
  findBySysId(sysId: string): Promise<KnowledgeArticle | null>;
}
