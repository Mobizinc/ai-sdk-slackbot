/**
 * Missing Categories Report API
 * Returns AI-suggested categories that don't exist in ServiceNow
 */

import { getCategoryMismatchRepository } from '../../../lib/db/repositories/category-mismatch-repository';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    const repo = getCategoryMismatchRepository();

    const [statistics, topCategories, recentMismatches] = await Promise.all([
      repo.getStatistics(days),
      repo.getTopSuggestedCategories(days),
      repo.getRecentMismatches(50),
    ]);

    // Group by category to show subcategories
    const categoryDetails = new Map();
    recentMismatches.forEach(m => {
      if (!categoryDetails.has(m.aiSuggestedCategory)) {
        categoryDetails.set(m.aiSuggestedCategory, {
          category: m.aiSuggestedCategory,
          subcategories: new Set(),
          cases: [],
        });
      }
      const detail = categoryDetails.get(m.aiSuggestedCategory);
      if (m.aiSuggestedSubcategory) {
        detail.subcategories.add(m.aiSuggestedSubcategory);
      }
      detail.cases.push({
        caseNumber: m.caseNumber,
        confidence: m.confidenceScore,
        correctedTo: m.correctedCategory,
        description: m.caseDescription,
      });
    });

    const categoriesWithDetails = Array.from(categoryDetails.values()).map(d => ({
      category: d.category,
      subcategories: Array.from(d.subcategories),
      caseCount: d.cases.length,
      cases: d.cases.slice(0, 5), // Top 5 examples
    }));

    return Response.json({
      statistics,
      topCategories,
      categoriesWithDetails,
      timeRange: `${days} days`,
    });
  } catch (error) {
    console.error('[Missing Categories API] Error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
