/**
 * KB Article Search Service
 * Searches knowledge base articles using Azure Search
 */

import { createAzureSearchService, type SimilarCase } from './azure-search';

export interface KBArticle {
  kb_number: string;
  title: string;
  category?: string;
  similarity_score: number;
  url?: string;
  summary?: string;
}

/**
 * Search KB articles by embedding similarity
 */
export async function searchKBArticles(
  queryText: string,
  topK: number = 3
): Promise<KBArticle[]> {
  const searchService = createAzureSearchService();

  if (!searchService) {
    console.log('[KB Article Search] Azure Search not configured, returning empty results');
    return [];
  }

  try {
    console.log(`[KB Article Search] Searching for: "${queryText.substring(0, 50)}..."`);

    // Use the existing Azure Search service to search for KB articles
    // We'll search the same index but filter for KB content if possible
    const results = await searchService.searchSimilarCases(queryText, {
      topK,
      // Note: If the index has a content_type field, we could filter for KB articles
      // For now, we'll return all results and let the caller determine relevance
    });

    // Transform results to KB article format
    const kbArticles: KBArticle[] = results.map((result: SimilarCase) => ({
      kb_number: result.case_number, // This might need adjustment based on actual index schema
      title: result.content.substring(0, 100) + (result.content.length > 100 ? '...' : ''),
      similarity_score: result.score,
      url: `https://your-servicenow-instance.com/kb_view.do?sysparm_article=${result.case_number}`, // Template URL
      summary: result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''),
    }));

    console.log(`[KB Article Search] Found ${kbArticles.length} KB articles`);
    return kbArticles;

  } catch (error) {
    console.error('[KB Article Search] Error searching KB articles:', error);
    return [];
  }
}

/**
 * Search KB articles with advanced filtering
 */
export async function searchKBArticlesAdvanced(
  queryText: string,
  options: {
    topK?: number;
    category?: string;
    minScore?: number;
    dateRange?: {
      from: string;
      to: string;
    };
  } = {}
): Promise<KBArticle[]> {
  const { topK = 3, category, minScore = 0.1, dateRange } = options;

  const searchService = createAzureSearchService();

  if (!searchService) {
    return [];
  }

  try {
    // Build filters
    const filters: Record<string, string> = {};
    
    if (category) {
      filters.category = category;
    }

    if (dateRange) {
      filters.date_range = `${dateRange.from}:${dateRange.to}`;
    }

    // Search with filters
    const results = await searchService.searchSimilarCases(queryText, {
      topK,
      filters,
    });

    // Filter by minimum score and transform
    const kbArticles: KBArticle[] = results
      .filter((result: SimilarCase) => result.score >= minScore)
      .map((result: SimilarCase) => ({
        kb_number: result.case_number,
        title: result.content.substring(0, 100) + (result.content.length > 100 ? '...' : ''),
        category: category, // Would come from index if available
        similarity_score: result.score,
        url: `https://your-servicenow-instance.com/kb_view.do?sysparm_article=${result.case_number}`,
        summary: result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''),
      }));

    return kbArticles;

  } catch (error) {
    console.error('[KB Article Search] Advanced search error:', error);
    return [];
  }
}

/**
 * Get KB article by number
 */
export async function getKBArticleByNumber(kbNumber: string): Promise<KBArticle | null> {
  const searchService = createAzureSearchService();

  if (!searchService) {
    return null;
  }

  try {
    // Search for the specific KB article
    const results = await searchService.searchSimilarCases(kbNumber, {
      topK: 1,
    });

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    
    return {
      kb_number: result.case_number,
      title: result.content.substring(0, 100) + (result.content.length > 100 ? '...' : ''),
      similarity_score: 1.0, // Perfect match for direct lookup
      url: `https://your-servicenow-instance.com/kb_view.do?sysparm_article=${result.case_number}`,
      summary: result.content,
    };

  } catch (error) {
    console.error('[KB Article Search] Error getting KB article:', error);
    return null;
  }
}

/**
 * Suggest related KB articles based on case content
 */
export async function suggestRelatedKBArticles(
  caseTitle: string,
  caseDescription: string,
  topK: number = 5
): Promise<KBArticle[]> {
  // Combine title and description for better search results
  const combinedQuery = `${caseTitle} ${caseDescription}`.trim();

  return searchKBArticles(combinedQuery, topK);
}

/**
 * Format KB article for display
 */
export function formatKBArticleForDisplay(article: KBArticle): string {
  let formatted = `📚 ${article.kb_number}: ${article.title}`;
  
  if (article.category) {
    formatted += ` [${article.category}]`;
  }
  
  formatted += `\n   Score: ${(article.similarity_score * 100).toFixed(1)}%`;
  
  if (article.summary) {
    formatted += `\n   ${article.summary}`;
  }
  
  if (article.url) {
    formatted += `\n   ${article.url}`;
  }
  
  return formatted;
}

/**
 * Batch search multiple KB articles
 */
export async function batchSearchKBArticles(
  queries: string[],
  topK: number = 3
): Promise<Array<{ query: string; articles: KBArticle[] }>> {
  const results = await Promise.all(
    queries.map(async (query) => ({
      query,
      articles: await searchKBArticles(query, topK),
    }))
  );

  return results;
}