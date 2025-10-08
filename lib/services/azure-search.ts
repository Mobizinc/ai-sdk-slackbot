/**
 * Azure AI Search service for querying the existing vector store.
 * Provides read-only access to case intelligence index.
 */

import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { OpenAI } from "openai";

export interface SimilarCase {
  id: string;
  case_number: string;
  content: string;
  filename: string;
  score: number;
  chunk_index?: number;
  created_at?: string;
}

export interface SearchOptions {
  topK?: number;
  clientId?: string;
  filters?: Record<string, string>;
}

export class AzureSearchService {
  private searchClient: SearchClient<any>;
  private openaiClient: OpenAI;
  private embeddingModel: string;

  constructor(
    endpoint: string,
    apiKey: string,
    indexName: string,
    openaiApiKey: string,
    embeddingModel: string = "text-embedding-3-small"
  ) {
    this.searchClient = new SearchClient(
      endpoint,
      indexName,
      new AzureKeyCredential(apiKey)
    );

    this.openaiClient = new OpenAI({
      apiKey: openaiApiKey,
    });

    this.embeddingModel = embeddingModel;
  }

  /**
   * Generate embedding for a query string
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openaiClient.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Failed to generate embedding:", error);
      throw new Error("Failed to generate query embedding");
    }
  }

  /**
   * Search for similar cases using vector similarity
   */
  async searchSimilarCases(
    query: string,
    options: SearchOptions = {}
  ): Promise<SimilarCase[]> {
    const { topK = 5, clientId, filters = {} } = options;

    try {
      // Generate embedding for the query
      const queryVector = await this.generateEmbedding(query);

      // Build filter expression
      const filterParts: string[] = [];

      // Filter by client_id for multi-tenancy
      if (clientId) {
        filterParts.push(`client_id eq '${clientId}'`);
      }

      // Add additional filters
      for (const [field, value] of Object.entries(filters)) {
        if (typeof value === "string") {
          filterParts.push(`${field} eq '${value}'`);
        }
      }

      const filterExpression = filterParts.length > 0
        ? filterParts.join(" and ")
        : undefined;

      // Perform vector search
      const searchResults = await this.searchClient.search("*", {
        vectorSearchOptions: {
          queries: [
            {
              kind: "vector",
              vector: queryVector,
              kNearestNeighborsCount: topK,
              fields: ["embedding"],
            },
          ],
        },
        select: [
          "id",
          "case_number",
          "description",
          "short_description",
          "client_id",
          "client_name",
          "category",
          "priority",
          "quality_score",
          "created_at",
          "resolved_at",
        ],
        top: topK,
        filter: filterExpression,
      });

      const results: SimilarCase[] = [];

      for await (const result of searchResults.results) {
        results.push({
          id: result.document.id,
          case_number: result.document.case_number || "Unknown",
          content: result.document.description || result.document.short_description || "",
          filename: result.document.case_number || "",
          score: result.score || 0,
          chunk_index: 0,
          created_at: result.document.created_at,
        });
      }

      console.log(`Found ${results.length} similar cases for query: "${query.substring(0, 50)}..."`);
      return results;
    } catch (error) {
      console.error("Vector search failed:", error);
      return [];
    }
  }

  /**
   * Search knowledge base articles
   */
  async searchKnowledgeBase(
    query: string,
    options: SearchOptions = {}
  ): Promise<SimilarCase[]> {
    // Search for KB articles
    // Note: If your index has a content_type field, uncomment the filter below
    // const kbFilters = {
    //   ...options.filters,
    //   content_type: "knowledge_base",
    // };

    return this.searchSimilarCases(query, {
      ...options,
      // filters: kbFilters, // Uncomment when index has content_type field
    });
  }
}

/**
 * Initialize Azure Search service from environment variables
 */
export function createAzureSearchService(): AzureSearchService | null {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const embeddingModel = process.env.CASE_EMBEDDING_MODEL || "text-embedding-3-small";

  if (!endpoint || !apiKey || !indexName || !openaiApiKey) {
    console.warn(
      "Azure Search is not configured. Missing required environment variables."
    );
    return null;
  }

  return new AzureSearchService(
    endpoint,
    apiKey,
    indexName,
    openaiApiKey,
    embeddingModel
  );
}
