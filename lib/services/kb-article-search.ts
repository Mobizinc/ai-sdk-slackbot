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
 *
 * TODO: This is currently DISABLED because the Python implementation uses SQL Server tables
 * (servicenow_kb_articles, kb_article_embeddings) which we don't have in Neon Postgres.
 *
 * The previous implementation was incorrectly searching the CASE index and returning
 * cases pretending to be KB articles (hence why you saw SCS#### instead of KB####).
 *
 * To properly implement:
 * 1. Create servicenow_kb_articles and kb_article_embeddings tables in Postgres
 * 2. Sync KB articles from ServiceNow kb_knowledge table
 * 3. Generate embeddings for KB articles
 * 4. Search via vector similarity like Python does
 *
 * OR use ServiceNow API directly: serviceNowClient.searchKnowledge()
 */
export async function searchKBArticles(
  queryText: string,
  topK: number = 3
): Promise<KBArticle[]> {
  // DISABLED: Returning empty array to avoid misleading data
  // Previously this was returning CASES pretending to be KB articles
  console.log('[KB Article Search] DISABLED - KB article tables not yet implemented in Postgres');
  return [];

  /* BROKEN IMPLEMENTATION - DO NOT USE
  const searchService = createAzureSearchService();

  if (!searchService) {
    console.log('[KB Article Search] Azure Search not configured, returning empty results');
    return [];
  }

  try {
    console.log(`[KB Article Search] Searching for: "${queryText.substring(0, 50)}..."`);

    // BUG: This searches CASES, not KB articles!
    const results = await searchService.searchSimilarCases(queryText, {
      topK,
    });

    // BUG: Renames case_number to kb_number - completely wrong!
    const kbArticles: KBArticle[] = results.map((result: SimilarCase) => ({
      kb_number: result.case_number, // ← WRONG: This is a case number, not KB article number!
      title: result.content.substring(0, 100) + (result.content.length > 100 ? '...' : ''),
      similarity_score: result.score,
      url: `https://your-servicenow-instance.com/kb_view.do?sysparm_article=${result.case_number}`,
      summary: result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''),
    }));

    console.log(`[KB Article Search] Found ${kbArticles.length} KB articles`);
    return kbArticles;

  } catch (error) {
    console.error('[KB Article Search] Error searching KB articles:', error);
    return [];
  }
  */
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