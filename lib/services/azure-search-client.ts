/**
 * Azure AI Search Client Service
 * Provides vector search (semantic) and hybrid search capabilities for case intelligence
 *
 * Original: api/app/services/case_intelligence/azure_search_service.py
 *          api/app/services/case_intelligence/case_search_service.py
 *
 * UPDATED: The production index "case-intelligence-prod" HAS embedding vectors (1536 dimensions)
 * Vector field name: "embedding"
 * Vector search profile: "case-vector-profile"
 * This implementation uses VECTOR SEARCH by default for better semantic matching.
 */

import type { SimilarCaseResult } from "../schemas/servicenow-webhook";

export interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
}

export interface AzureSearchConfig {
  endpoint: string;
  apiKey: string;
  indexName: string;
  embeddingService?: EmbeddingService;
}

export interface SearchSimilarCasesOptions {
  accountSysId?: string;
  topK?: number;
  crossClient?: boolean;
  searchFields?: string[];
  selectFields?: string[];
  withinDays?: number; // Filter to cases opened within last N days (default: 30)
}

export interface KeywordSearchResponse {
  value: Array<{
    case_number: string;
    client_id?: string;
    client_name?: string;
    short_description?: string;
    description?: string;
    category?: string;
    subcategory?: string;
    state?: string;
    resolution_notes?: string;
    opened_at?: string;
    sys_created_on?: string;
    "@search.score": number;
  }>;
  "@odata.count"?: number;
}

/**
 * Azure AI Search Client
 * Handles vector search (semantic) and keyword search (BM25) for case intelligence
 */
export class AzureSearchClient {
  private endpoint: string;
  private apiKey: string;
  private indexName: string;
  private apiVersion = "2024-07-01";
  private embeddingService?: EmbeddingService;

  constructor(config: AzureSearchConfig) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.indexName = config.indexName;
    this.embeddingService = config.embeddingService;

    const searchMode = this.embeddingService ? "vector + keyword (hybrid)" : "keyword only (BM25)";
    console.log(`[Azure Search] Initialized client for index: ${this.indexName} (${searchMode})`);
  }

  /**
   * Search for similar cases using vector search (semantic) with keyword fallback
   *
   * The production index contains:
   * - 7,844 case documents
   * - Text fields: short_description, description, category, client_id, client_name
   * - Vector field: "embedding" (1536 dimensions) - text-embedding-3-small
   * - Vector search profile: "case-vector-profile"
   *
   * Search Strategy:
   * 1. If embedding service available → Vector search (better semantic matching)
   * 2. If no embedding service → Keyword search fallback (BM25)
   *
   * Vector search advantages:
   * - Semantic matching: "scanner malfunction" finds "imaging device not responding"
   * - Better cross-client pattern recognition
   * - More accurate similarity scores (cosine similarity 0-1)
   *
   * Original: api/app/services/case_intelligence/case_search_service.py:169-268
   */
  async searchSimilarCases(
    queryText: string,
    options: SearchSimilarCasesOptions = {}
  ): Promise<SimilarCaseResult[]> {
    // Try vector search first if embedding service is available
    if (this.embeddingService) {
      try {
        return await this.searchSimilarCasesVector(queryText, options);
      } catch (error) {
        console.warn('[Azure Search] Vector search failed, falling back to keyword search:', error);
        // Fall through to keyword search
      }
    }

    // Fallback to keyword search (BM25)
    return await this.searchSimilarCasesKeyword(queryText, options);
  }

  /**
   * Search for similar cases using VECTOR SEARCH (semantic similarity)
   *
   * Uses embedding vectors for semantic matching. Better than keyword search for:
   * - Conceptual similarity ("password reset" matches "credential issues")
   * - Cross-client pattern recognition
   * - Cases with different wording but same meaning
   *
   * Requires: Embedding service configured
   */
  private async searchSimilarCasesVector(
    queryText: string,
    options: SearchSimilarCasesOptions = {}
  ): Promise<SimilarCaseResult[]> {
    if (!this.embeddingService) {
      throw new Error('Embedding service not configured');
    }

    const {
      accountSysId,
      topK = 5,
      crossClient = true,
      withinDays = parseInt(process.env.SIMILAR_CASES_WITHIN_DAYS || "30"),
      selectFields = [
        "case_number",
        "client_id",
        "client_name",
        "short_description",
        "description",
        "category",
        "subcategory",
        "state",
        "resolution_notes",
      ],
    } = options;

    try {
      const searchUrl = `${this.endpoint}/indexes/${this.indexName}/docs/search?api-version=${this.apiVersion}`;

      // Generate embedding for query
      console.log('[Azure Search] Generating embedding for query...');
      const queryVector = await this.embeddingService.generateEmbedding(queryText);

      // Build vector search request
      const searchBody: any = {
        vectorQueries: [
          {
            kind: "vector",
            vector: queryVector,
            fields: "embedding",
            k: topK,
          },
        ],
        select: selectFields.join(","),
        top: topK,
      };

      // Build filters
      const filters: string[] = [];

      // Date filtering disabled - Azure Search index doesn't have date fields
      // withinDays parameter is ignored

      // Add client filter if not cross-client search
      if (!crossClient && accountSysId) {
        filters.push(`client_id eq '${accountSysId}'`);
      }

      // Combine filters
      if (filters.length > 0) {
        searchBody.filter = filters.join(" and ");
      }

      if (!crossClient && accountSysId) {
        console.log(`[Azure Search] Vector search for client: ${accountSysId}`);
      } else {
        console.log(`[Azure Search] Vector search across ALL clients (MSP mode)`);
      }

      // Execute vector search via REST API
      const response = await fetch(searchUrl, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Azure Search API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const results: KeywordSearchResponse = await response.json();

      // Enrich results with MSP attribution
      const enrichedResults: SimilarCaseResult[] = (results.value || []).map((result) => {
        const resultClientId = result.client_id;
        const sameClient = accountSysId ? resultClientId === accountSysId : false;

        return {
          case_number: result.case_number,
          short_description: result.short_description || "",
          description: result.description,
          category: result.category,
          subcategory: result.subcategory,
          resolution_notes: result.resolution_notes,
          state: result.state,
          similarity_score: result["@search.score"],
          // MSP cross-client attribution
          client_id: resultClientId,
          client_name: result.client_name,
          same_client: sameClient,
          // Date fields for recency display
          opened_at: result.opened_at,
          sys_created_on: result.sys_created_on,
        };
      });

      console.log(
        `[Azure Search] Found ${enrichedResults.length} similar cases using VECTOR SEARCH ` +
          `(${crossClient ? "cross-client" : "single-client"})`
      );

      if (enrichedResults.length > 0) {
        const topScore = enrichedResults[0].similarity_score;
        const sameClientCount = enrichedResults.filter((r) => r.same_client).length;
        console.log(
          `[Azure Search] Top similarity score: ${topScore.toFixed(2)}, ` +
            `Same client: ${sameClientCount}/${enrichedResults.length}`
        );
      }

      return enrichedResults;
    } catch (error) {
      console.error("[Azure Search] Vector search failed:", error);
      throw error; // Rethrow to trigger fallback
    }
  }

  /**
   * Search for similar cases using KEYWORD SEARCH (BM25) - fallback method
   *
   * BM25 (Best Match 25) algorithm:
   * - Probabilistic ranking function
   * - Scores based on term frequency and inverse document frequency
   * - Fast, no embeddings required
   * - Good for keyword-rich queries
   *
   * Used as fallback when vector search is not available
   */
  private async searchSimilarCasesKeyword(
    queryText: string,
    options: SearchSimilarCasesOptions = {}
  ): Promise<SimilarCaseResult[]> {
    const {
      accountSysId,
      topK = 5,
      crossClient = true,
      withinDays = parseInt(process.env.SIMILAR_CASES_WITHIN_DAYS || "30"),
      searchFields = ["short_description", "description"],
      selectFields = [
        "case_number",
        "client_id",
        "client_name",
        "short_description",
        "description",
        "category",
        "subcategory",
        "state",
        "resolution_notes",
      ],
    } = options;

    try {
      const searchUrl = `${this.endpoint}/indexes/${this.indexName}/docs/search?api-version=${this.apiVersion}`;

      // Build search request body for BM25 keyword search
      const searchBody: {
        search: string;
        searchFields: string;
        select: string;
        top: number;
        filter?: string;
        queryType?: string;
      } = {
        search: queryText,
        searchFields: searchFields.join(","),
        select: selectFields.join(","),
        top: topK,
      };

      // Build filters
      const filters: string[] = [];

      // Date filtering disabled - Azure Search index doesn't have date fields
      // withinDays parameter is ignored

      // Add client filter if not cross-client search
      if (!crossClient && accountSysId) {
        filters.push(`client_id eq '${accountSysId}'`);
      }

      // Combine filters
      if (filters.length > 0) {
        searchBody.filter = filters.join(" and ");
      }

      if (!crossClient && accountSysId) {
        console.log(`[Azure Search] Searching similar cases for client: ${accountSysId}`);
      } else {
        console.log(`[Azure Search] Searching similar cases across ALL clients (MSP mode)`);
      }

      // Execute keyword search via REST API
      const response = await fetch(searchUrl, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Azure Search API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const results: KeywordSearchResponse = await response.json();

      // Enrich results with MSP attribution
      const enrichedResults: SimilarCaseResult[] = (results.value || []).map((result) => {
        const resultClientId = result.client_id;
        const sameClient = accountSysId ? resultClientId === accountSysId : false;

        return {
          case_number: result.case_number,
          short_description: result.short_description || "",
          description: result.description,
          category: result.category,
          subcategory: result.subcategory,
          resolution_notes: result.resolution_notes,
          state: result.state,
          similarity_score: result["@search.score"],
          // MSP cross-client attribution
          client_id: resultClientId,
          client_name: result.client_name,
          same_client: sameClient,
          // Date fields for recency display
          opened_at: result.opened_at,
          sys_created_on: result.sys_created_on,
        };
      });

      console.log(
        `[Azure Search] Found ${enrichedResults.length} similar cases using BM25 keyword search ` +
          `(${crossClient ? "cross-client" : "single-client"})`
      );

      if (enrichedResults.length > 0) {
        const topScore = enrichedResults[0].similarity_score;
        const sameClientCount = enrichedResults.filter((r) => r.same_client).length;
        console.log(
          `[Azure Search] Top similarity score: ${topScore.toFixed(2)}, ` +
            `Same client: ${sameClientCount}/${enrichedResults.length}`
        );
      }

      return enrichedResults;
    } catch (error) {
      console.error("[Azure Search] Failed to search similar cases:", error);
      return [];
    }
  }

  /**
   * Test connectivity to Azure AI Search service
   */
  async testConnection(): Promise<{ success: boolean; message: string; indexName?: string }> {
    try {
      const indexUrl = `${this.endpoint}/indexes/${this.indexName}?api-version=${this.apiVersion}`;

      const response = await fetch(indexUrl, {
        method: "GET",
        headers: {
          "api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Index not found or access denied: ${response.status} ${response.statusText}`,
        };
      }

      const indexInfo = await response.json();

      return {
        success: true,
        message: "Connected successfully",
        indexName: indexInfo.name,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<{
    indexName: string;
    documentCount?: number;
    error?: string;
  }> {
    try {
      const statsUrl = `${this.endpoint}/indexes/${this.indexName}/stats?api-version=${this.apiVersion}`;

      const response = await fetch(statsUrl, {
        method: "GET",
        headers: {
          "api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Stats API error: ${response.status} ${response.statusText}`);
      }

      const stats = await response.json();

      return {
        indexName: this.indexName,
        documentCount: stats.documentCount,
      };
    } catch (error) {
      console.error("[Azure Search] Failed to get index stats:", error);
      return {
        indexName: this.indexName,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

/**
 * Factory function to create Azure Search client from environment variables
 * Automatically includes embedding service if OpenAI is configured
 */
export function createAzureSearchClient(
  indexName: string = "case-intelligence-prod"
): AzureSearchClient | null {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY;

  if (!endpoint || !apiKey) {
    console.warn(
      "[Azure Search] Not configured - AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY missing"
    );
    return null;
  }

  // Check if we should enable vector search (requires OpenAI for embeddings)
  let embeddingService: EmbeddingService | undefined;

  if (process.env.OPENAI_API_KEY) {
    try {
      // Import embedding service dynamically to avoid circular dependencies
      const { getEmbeddingService } = require('./embedding-service');
      embeddingService = getEmbeddingService();
      console.log('[Azure Search] Embedding service enabled - will use VECTOR SEARCH');
    } catch (error) {
      console.warn('[Azure Search] Failed to initialize embedding service, using keyword search:', error);
    }
  } else {
    console.log('[Azure Search] OpenAI not configured - using KEYWORD SEARCH (BM25) fallback');
  }

  return new AzureSearchClient({
    endpoint,
    apiKey,
    indexName,
    embeddingService,
  });
}

/**
 * Helper function to format client label for work notes (MSP attribution)
 *
 * Original: api/app/routers/webhooks.py:661-670
 */
export function getClientLabel(
  sameClient: boolean,
  clientName?: string | null
): string {
  if (sameClient) {
    return "[Your Organization]";
  }

  if (clientName) {
    return `[${clientName}]`;
  }

  return "[Different Client]";
}
