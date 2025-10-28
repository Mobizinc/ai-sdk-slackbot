/**
 * Knowledge Repository Implementation
 *
 * Implements KnowledgeRepository interface using ServiceNowHttpClient
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { KnowledgeRepository } from "./knowledge-repository.interface";
import type { KnowledgeArticle } from "../types/domain-models";
import type { KnowledgeArticleRecord } from "../types/api-responses";
import { mapKnowledgeArticle } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";

/**
 * Configuration for Knowledge Repository
 */
export interface KnowledgeRepositoryConfig {
  knowledgeTable: string; // e.g., "kb_knowledge"
}

/**
 * ServiceNow Knowledge Repository Implementation
 */
export class ServiceNowKnowledgeRepository implements KnowledgeRepository {
  private readonly knowledgeTable: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<KnowledgeRepositoryConfig>,
  ) {
    this.knowledgeTable = config?.knowledgeTable ?? "kb_knowledge";
  }

  /**
   * Search for knowledge articles by text query
   */
  async search(query: string, limit = 10): Promise<KnowledgeArticle[]> {
    const response = await this.httpClient.get<KnowledgeArticleRecord>(
      `/api/now/table/${this.knowledgeTable}`,
      {
        sysparm_query: `ORDERBYDESCsys_updated_on^textLIKE${query}`,
        sysparm_limit: limit,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record) => mapKnowledgeArticle(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find a knowledge article by its number
   */
  async findByNumber(number: string): Promise<KnowledgeArticle | null> {
    const response = await this.httpClient.get<KnowledgeArticleRecord>(
      `/api/now/table/${this.knowledgeTable}`,
      {
        sysparm_query: `number=${number}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      },
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapKnowledgeArticle(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Find a knowledge article by its sys_id
   */
  async findBySysId(sysId: string): Promise<KnowledgeArticle | null> {
    try {
      const response = await this.httpClient.get<KnowledgeArticleRecord>(
        `/api/now/table/${this.knowledgeTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return mapKnowledgeArticle(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      // If 404, return null instead of throwing
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}
