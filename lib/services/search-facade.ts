/**
 * Search Facade Service
 *
 * Unified interface for all search operations (Azure Search, Web Search).
 * Provides high-level methods that abstract search complexity.
 *
 * Benefits:
 * - Single entry point for all search needs
 * - Consistent error handling
 * - Easier to mock in tests
 * - Abstracts provider-specific details
 */

import { createAzureSearchService, type AzureSearchService, type SimilarCase, type SearchOptions } from './azure-search';
import { exa } from '../utils';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOptions {
  numResults?: number;
  specificDomain?: string;
  livecrawl?: boolean;
}

/**
 * Search Facade Service
 * Provides unified interface for Azure Search and Web Search
 */
export class SearchFacadeService {
  private azureSearchService: AzureSearchService | null;

  constructor(azureSearchService?: AzureSearchService | null) {
    this.azureSearchService = azureSearchService ?? createAzureSearchService();
  }

  /**
   * Check if Azure Search is configured and available
   */
  isAzureSearchConfigured(): boolean {
    return this.azureSearchService !== null;
  }

  /**
   * Check if Web Search (Exa) is configured and available
   */
  isWebSearchConfigured(): boolean {
    return exa !== null;
  }

  /**
   * Search for similar cases using Azure AI Search
   * Returns empty array if Azure Search not configured
   */
  async searchSimilarCases(
    query: string,
    options: SearchOptions = {}
  ): Promise<SimilarCase[]> {
    if (!this.azureSearchService) {
      console.warn('[Search Facade] Azure Search not configured - cannot search similar cases');
      return [];
    }

    try {
      return await this.azureSearchService.searchSimilarCases(query, options);
    } catch (error) {
      console.error('[Search Facade] Failed to search similar cases:', error);
      return [];
    }
  }

  /**
   * Search knowledge base articles using Azure AI Search
   * Returns empty array if Azure Search not configured
   */
  async searchKnowledgeBase(
    query: string,
    options: SearchOptions = {}
  ): Promise<SimilarCase[]> {
    if (!this.azureSearchService) {
      console.warn('[Search Facade] Azure Search not configured - cannot search KB');
      return [];
    }

    try {
      return await this.azureSearchService.searchKnowledgeBase(query, options);
    } catch (error) {
      console.error('[Search Facade] Failed to search knowledge base:', error);
      return [];
    }
  }

  /**
   * Search the web using Exa
   * Returns empty array if web search not configured
   */
  async searchWeb(
    query: string,
    options: WebSearchOptions = {}
  ): Promise<WebSearchResult[]> {
    const exaClient = exa;

    if (!exaClient) {
      console.warn('[Search Facade] Web search (Exa) not configured');
      return [];
    }

    const {
      numResults = 3,
      specificDomain,
      livecrawl = true,
    } = options;

    try {
      const { results } = await exaClient.searchAndContents(query, {
        livecrawl: livecrawl ? 'always' : 'never',
        numResults,
        includeDomains: specificDomain ? [specificDomain] : undefined,
      });

      return results.map((result: any) => ({
        title: result.title,
        url: result.url,
        snippet: result.text?.slice(0, 1000) || '',
      }));
    } catch (error) {
      console.error('[Search Facade] Failed to search web:', error);
      return [];
    }
  }

  /**
   * Search for cases with company/client context
   * Convenience method for client-specific searches
   */
  async searchSimilarCasesForClient(
    query: string,
    clientId: string,
    options: Omit<SearchOptions, 'clientId'> = {}
  ): Promise<SimilarCase[]> {
    return this.searchSimilarCases(query, {
      ...options,
      clientId,
    });
  }

  /**
   * Search for top N similar cases (convenience method)
   */
  async searchTopSimilarCases(
    query: string,
    topN: number = 5,
    clientId?: string
  ): Promise<SimilarCase[]> {
    return this.searchSimilarCases(query, {
      topK: topN,
      clientId,
    });
  }

  /**
   * Search for similar cases and format as markdown
   * Useful for including in LLM context
   */
  async searchAndFormatAsMarkdown(
    query: string,
    options: SearchOptions = {}
  ): Promise<string> {
    const cases = await this.searchSimilarCases(query, options);

    if (cases.length === 0) {
      return 'No similar cases found.';
    }

    const formatted = cases.map((c, i) => {
      const score = Math.round(c.score * 100);
      return `${i + 1}. **${c.case_number}** (${score}% similar)\n   ${c.content.substring(0, 200)}...`;
    }).join('\n\n');

    return `Found ${cases.length} similar case(s):\n\n${formatted}`;
  }

  /**
   * Check if any search provider is available
   */
  hasAnySearchProvider(): boolean {
    return this.isAzureSearchConfigured() || this.isWebSearchConfigured();
  }

  /**
   * Get search capabilities summary
   */
  getCapabilities(): {
    azureSearch: boolean;
    webSearch: boolean;
    similarCases: boolean;
    knowledgeBase: boolean;
  } {
    const azureSearch = this.isAzureSearchConfigured();
    const webSearch = this.isWebSearchConfigured();

    return {
      azureSearch,
      webSearch,
      similarCases: azureSearch,
      knowledgeBase: azureSearch,
    };
  }
}

// Singleton instance
let searchFacadeService: SearchFacadeService | null = null;

/**
 * Get the search facade service singleton
 */
export function getSearchFacadeService(): SearchFacadeService {
  if (!searchFacadeService) {
    searchFacadeService = new SearchFacadeService();
  }
  return searchFacadeService;
}

/**
 * Reset the service instance (for testing)
 */
export function __resetSearchFacadeService(): void {
  searchFacadeService = null;
}

/**
 * Set a custom service instance (for testing)
 */
export function __setSearchFacadeService(service: SearchFacadeService): void {
  searchFacadeService = service;
}
