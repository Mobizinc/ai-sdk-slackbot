/**
 * Case Intelligence Service
 * Wraps Azure Search client to fetch similar cases and KB articles
 */

import { createAzureSearchService, type SimilarCase as AzureSimilarCase } from "./azure-search";

export interface SimilarCase {
  caseNumber: string;
  title: string;
  description: string;
  priority?: string;
  state?: string;
  assignmentGroup?: string;
  similarityScore: number;
  url?: string;
  openedAt?: string;
}

export interface KBArticle {
  number: string;
  title: string;
  summary?: string;
  content?: string;
  relevanceScore: number;
  url?: string;
  publishedAt?: string;
  category?: string;
}

export interface CaseIntelligenceQuery {
  caseNumber: string;
  description: string;
  category?: string;
  subcategory?: string;
  assignmentGroup?: string;
  priority?: string;
  maxSimilarCases?: number;
  maxKBArticles?: number;
  minSimilarityScore?: number;
}

export interface CaseIntelligenceResult {
  similarCases: SimilarCase[];
  kbArticles: KBArticle[];
  queryMetadata: {
    totalSimilarCasesFound: number;
    totalKBArticlesFound: number;
    searchTimeMs: number;
    embeddingGenerated: boolean;
    searchIndex: string;
  };
}

export class CaseIntelligenceService {
  private azureSearchService = createAzureSearchService();

  /**
   * Get similar cases and KB articles for a case
   */
  public async getCaseIntelligence(query: CaseIntelligenceQuery): Promise<CaseIntelligenceResult> {
    const startTime = Date.now();
    const maxSimilarCases = query.maxSimilarCases || 3;
    const maxKBArticles = query.maxKBArticles || 3;
    const minSimilarityScore = query.minSimilarityScore || 0.7;

    try {
      // Build search query
      const searchQuery = this.buildSearchQuery(query);
      
      // Get similar cases
      const similarCases = await this.getSimilarCases(
        searchQuery,
        maxSimilarCases,
        minSimilarityScore
      );

      // Get KB articles
      const kbArticles = await this.getKBArticles(
        searchQuery,
        maxKBArticles,
        minSimilarityScore
      );

      const searchTimeMs = Date.now() - startTime;

      return {
        similarCases,
        kbArticles,
        queryMetadata: {
          totalSimilarCasesFound: similarCases.length,
          totalKBArticlesFound: kbArticles.length,
          searchTimeMs,
          embeddingGenerated: true, // Assume embedding is generated for semantic search
          searchIndex: process.env.AZURE_SEARCH_INDEX_NAME || 'case-intelligence-prod'
        }
      };
    } catch (error) {
      console.error('[CaseIntelligenceService] Error getting case intelligence:', error);
      
      return {
        similarCases: [],
        kbArticles: [],
        queryMetadata: {
          totalSimilarCasesFound: 0,
          totalKBArticlesFound: 0,
          searchTimeMs: Date.now() - startTime,
          embeddingGenerated: false,
          searchIndex: process.env.AZURE_SEARCH_INDEX_NAME || 'case-intelligence-prod'
        }
      };
    }
  }

  /**
   * Build search query from case information
   */
  private buildSearchQuery(query: CaseIntelligenceQuery): string {
    const queryParts: string[] = [];

    // Add description (most important)
    if (query.description) {
      queryParts.push(query.description);
    }

    // Add category information
    if (query.category) {
      queryParts.push(`category:${query.category}`);
    }

    if (query.subcategory) {
      queryParts.push(`subcategory:${query.subcategory}`);
    }

    // Add assignment group
    if (query.assignmentGroup) {
      queryParts.push(`assignment_group:${query.assignmentGroup}`);
    }

    // Add priority
    if (query.priority) {
      queryParts.push(`priority:${query.priority}`);
    }

    // Exclude current case from results
    if (query.caseNumber) {
      queryParts.push(`-case_number:${query.caseNumber}`);
    }

    return queryParts.join(' ');
  }

  /**
   * Get similar cases from Azure Search
   */
  private async getSimilarCases(
    searchQuery: string,
    maxResults: number,
    minScore: number
  ): Promise<SimilarCase[]> {
    if (!this.azureSearchService) return [];

    try {
      const searchResults = await this.azureSearchService.searchSimilarCases(searchQuery, {
        topK: maxResults
      });

      return searchResults
        .filter((result: AzureSimilarCase) => (result.score || 0) >= minScore)
        .map((result: AzureSimilarCase) => ({
          caseNumber: result.case_number || '',
          title: result.content?.substring(0, 100) || '',
          description: result.content || '',
          similarityScore: result.score || 0,
          openedAt: result.created_at
        }));
    } catch (error) {
      console.error('[CaseIntelligenceService] Error getting similar cases:', error);
      return [];
    }
  }

  /**
   * Get KB articles from Azure Search
   */
  private async getKBArticles(
    searchQuery: string,
    maxResults: number,
    minScore: number
  ): Promise<KBArticle[]> {
    if (!this.azureSearchService) return [];

    try {
      const searchResults = await this.azureSearchService.searchKnowledgeBase(searchQuery, {
        topK: maxResults
      });

      return searchResults
        .filter((result: AzureSimilarCase) => (result.score || 0) >= minScore)
        .map((result: AzureSimilarCase) => ({
          number: result.case_number || '',
          title: result.content?.substring(0, 100) || '',
          summary: result.content?.substring(0, 200),
          content: result.content,
          relevanceScore: result.score || 0,
          publishedAt: result.created_at
        }));
    } catch (error) {
      console.error('[CaseIntelligenceService] Error getting KB articles:', error);
      return [];
    }
  }

  /**
   * Get case intelligence by case number only
   */
  public async getCaseIntelligenceByNumber(
    caseNumber: string,
    options: {
      maxSimilarCases?: number;
      maxKBArticles?: number;
      includeDescription?: boolean;
    } = {}
  ): Promise<CaseIntelligenceResult> {
    // This would typically fetch the case details first
    // For now, we'll search using just the case number
    const query: CaseIntelligenceQuery = {
      caseNumber,
      description: caseNumber, // Fallback to case number as search term
      maxSimilarCases: options.maxSimilarCases,
      maxKBArticles: options.maxKBArticles
    };

    return this.getCaseIntelligence(query);
  }

  /**
   * Get trending cases (high activity or similar patterns)
   */
  public async getTrendingCases(timeframe: 'day' | 'week' | 'month' = 'week'): Promise<SimilarCase[]> {
    try {
      // This would implement trending logic based on search analytics
      // For now, return recent similar cases
      const searchQuery = `opened_at>${this.getTimeframeFilter(timeframe)}`;
      
      const results = await this.azureSearchService?.searchSimilarCases(searchQuery, {
        topK: 10
      }) || [];

      return results.map((result: AzureSimilarCase) => ({
        caseNumber: result.case_number || '',
        title: result.content?.substring(0, 100) || '',
        description: result.content || '',
        similarityScore: result.score || 0,
        openedAt: result.created_at
      }));
    } catch (error) {
      console.error('[CaseIntelligenceService] Error getting trending cases:', error);
      return [];
    }
  }

  /**
   * Get knowledge gap analysis (areas with few KB articles)
   */
  public async getKnowledgeGaps(
    timeframe: 'week' | 'month' = 'month'
  ): Promise<Array<{
    category: string;
    caseCount: number;
    kbArticleCount: number;
    gap: number;
  }>> {
    try {
      // This would analyze case patterns vs KB coverage
      // For now, return a placeholder implementation
      return [
        {
          category: 'Network',
          caseCount: 45,
          kbArticleCount: 12,
          gap: 73.3
        },
        {
          category: 'Application',
          caseCount: 32,
          kbArticleCount: 8,
          gap: 75.0
        }
      ];
    } catch (error) {
      console.error('[CaseIntelligenceService] Error getting knowledge gaps:', error);
      return [];
    }
  }

  /**
   * Generate search query for specific timeframe
   */
  private getTimeframeFilter(timeframe: 'day' | 'week' | 'month'): string {
    const now = new Date();
    let filterDate: Date;

    switch (timeframe) {
      case 'day':
        filterDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        filterDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        filterDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    return filterDate.toISOString().split('T')[0];
  }

  /**
   * Check if Azure Search is properly configured
   */
  public isConfigured(): boolean {
    return !!(process.env.AZURE_SEARCH_ENDPOINT && process.env.AZURE_SEARCH_KEY);
  }

  /**
   * Get service health status
   */
  public async getHealthStatus(): Promise<{
    configured: boolean;
    connected: boolean;
    indexName: string;
    lastCheck: string;
  }> {
    const configured = this.isConfigured();
    let connected = false;
    let indexName = '';

    if (configured) {
      try {
        // Try a simple search to test connectivity
        await this.azureSearchService?.searchSimilarCases('test', { topK: 1 });
        connected = true;
        indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'case-intelligence-prod';
      } catch (error) {
        console.error('[CaseIntelligenceService] Health check failed:', error);
        connected = false;
      }
    }

    return {
      configured,
      connected,
      indexName,
      lastCheck: new Date().toISOString()
    };
  }
}

// Singleton instance
let caseIntelligenceService: CaseIntelligenceService | null = null;

export function getCaseIntelligenceService(): CaseIntelligenceService {
  if (!caseIntelligenceService) {
    caseIntelligenceService = new CaseIntelligenceService();
  }
  return caseIntelligenceService;
}