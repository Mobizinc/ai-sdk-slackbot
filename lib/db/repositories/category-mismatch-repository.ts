/**
 * Category Mismatch Repository
 * Tracks when AI suggests categories that don't exist in ServiceNow
 */

import { desc, eq, sql, and, gte } from "drizzle-orm";
import { getDb } from "../client";
import { categoryMismatchLog, type NewCategoryMismatchLog } from "../schema";

export class CategoryMismatchRepository {
  /**
   * Log a category mismatch (DUAL CATEGORIZATION: tracks which table)
   */
  async logMismatch(data: {
    caseNumber: string;
    caseSysId?: string;
    targetTable?: string; // "sn_customerservice_case" or "incident"
    aiSuggestedCategory: string;
    aiSuggestedSubcategory?: string;
    correctedCategory: string;
    confidenceScore: number;
    caseDescription: string;
  }): Promise<void> {
    const db = getDb();
    if (!db) {
      console.warn('[Category Mismatch] Database not available, skipping mismatch log');
      return;
    }

    try {
      await db.insert(categoryMismatchLog).values({
        caseNumber: data.caseNumber,
        caseSysId: data.caseSysId,
        targetTable: data.targetTable || 'sn_customerservice_case',
        aiSuggestedCategory: data.aiSuggestedCategory,
        aiSuggestedSubcategory: data.aiSuggestedSubcategory,
        correctedCategory: data.correctedCategory,
        confidenceScore: data.confidenceScore,
        caseDescription: data.caseDescription,
        reviewed: false,
      });

      console.log(
        `[Category Mismatch] Logged mismatch for ${data.caseNumber} (table: ${data.targetTable || 'sn_customerservice_case'}): ` +
        `AI suggested "${data.aiSuggestedCategory}" (${Math.round(data.confidenceScore * 100)}% confidence)`
      );
    } catch (error) {
      console.error('[Category Mismatch] Error logging mismatch:', error);
    }
  }

  /**
   * Get top AI-suggested categories that don't exist
   */
  async getTopSuggestedCategories(days: number = 30): Promise<Array<{
    category: string;
    count: number;
    avgConfidence: number;
  }>> {
    const db = getDb();
    if (!db) return [];

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const results = await db
        .select({
          category: categoryMismatchLog.aiSuggestedCategory,
          count: sql<number>`count(*)::int`,
          avgConfidence: sql<number>`avg(${categoryMismatchLog.confidenceScore})::float`,
        })
        .from(categoryMismatchLog)
        .where(gte(categoryMismatchLog.createdAt, cutoffDate))
        .groupBy(categoryMismatchLog.aiSuggestedCategory)
        .orderBy(sql`count(*) desc`)
        .limit(20);

      return results.map(r => ({
        category: r.category,
        count: r.count,
        avgConfidence: r.avgConfidence,
      }));
    } catch (error) {
      console.error('[Category Mismatch] Error getting top suggested categories:', error);
      return [];
    }
  }

  /**
   * Get recent mismatch examples
   */
  async getRecentMismatches(limit: number = 50): Promise<Array<{
    caseNumber: string;
    aiSuggestedCategory: string;
    aiSuggestedSubcategory?: string;
    correctedCategory: string;
    confidenceScore: number;
    caseDescription: string;
    createdAt: Date;
    reviewed: boolean;
  }>> {
    const db = getDb();
    if (!db) return [];

    try {
      const results = await db
        .select()
        .from(categoryMismatchLog)
        .orderBy(desc(categoryMismatchLog.createdAt))
        .limit(limit);

      return results.map(r => ({
        caseNumber: r.caseNumber,
        aiSuggestedCategory: r.aiSuggestedCategory,
        aiSuggestedSubcategory: r.aiSuggestedSubcategory || undefined,
        correctedCategory: r.correctedCategory,
        confidenceScore: r.confidenceScore,
        caseDescription: r.caseDescription,
        createdAt: r.createdAt,
        reviewed: r.reviewed,
      }));
    } catch (error) {
      console.error('[Category Mismatch] Error getting recent mismatches:', error);
      return [];
    }
  }

  /**
   * Get mismatch statistics
   */
  async getStatistics(days: number = 7): Promise<{
    totalMismatches: number;
    uniqueCategories: number;
    reviewedCount: number;
    avgConfidence: number;
  }> {
    const db = getDb();
    if (!db) {
      return {
        totalMismatches: 0,
        uniqueCategories: 0,
        reviewedCount: 0,
        avgConfidence: 0,
      };
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const [stats] = await db
        .select({
          totalMismatches: sql<number>`count(*)::int`,
          uniqueCategories: sql<number>`count(distinct ${categoryMismatchLog.aiSuggestedCategory})::int`,
          reviewedCount: sql<number>`count(*) filter (where ${categoryMismatchLog.reviewed} = true)::int`,
          avgConfidence: sql<number>`avg(${categoryMismatchLog.confidenceScore})::float`,
        })
        .from(categoryMismatchLog)
        .where(gte(categoryMismatchLog.createdAt, cutoffDate));

      return {
        totalMismatches: stats.totalMismatches,
        uniqueCategories: stats.uniqueCategories,
        reviewedCount: stats.reviewedCount,
        avgConfidence: stats.avgConfidence || 0,
      };
    } catch (error) {
      console.error('[Category Mismatch] Error getting statistics:', error);
      return {
        totalMismatches: 0,
        uniqueCategories: 0,
        reviewedCount: 0,
        avgConfidence: 0,
      };
    }
  }

  /**
   * Mark a category mismatch as reviewed
   */
  async markAsReviewed(id: number): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(categoryMismatchLog)
        .set({ reviewed: true })
        .where(eq(categoryMismatchLog.id, id));

      console.log(`[Category Mismatch] Marked mismatch ${id} as reviewed`);
    } catch (error) {
      console.error(`[Category Mismatch] Error marking mismatch ${id} as reviewed:`, error);
    }
  }
}

// Singleton instance
let repository: CategoryMismatchRepository | null = null;

export function getCategoryMismatchRepository(): CategoryMismatchRepository {
  if (!repository) {
    repository = new CategoryMismatchRepository();
  }
  return repository;
}
