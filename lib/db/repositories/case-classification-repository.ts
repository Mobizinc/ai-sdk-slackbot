/**
 * Case Classification Repository
 * Handles persistence of case classification data including inbound payloads, results, and discovered entities
 */

import { eq, and, desc, lt, gt } from "drizzle-orm";
import { getDb } from "../client";
import { 
  caseClassificationInbound, 
  caseClassificationResults, 
  caseDiscoveredEntities 
} from "../schema";
import type { 
  CaseClassificationInbound, 
  NewCaseClassificationInbound,
  CaseClassificationResults,
  NewCaseClassificationResults,
  CaseDiscoveredEntities,
  NewCaseDiscoveredEntities
} from "../schema";

export class CaseClassificationRepository {
  /**
   * Save inbound webhook payload
   */
  async saveInboundPayload(data: NewCaseClassificationInbound): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .insert(caseClassificationInbound)
        .values(data)
        .onConflictDoNothing();
      console.log(`[DB] Saved inbound payload for case ${data.caseNumber}`);
    } catch (error) {
      console.error(`[DB] Error saving inbound payload for case ${data.caseNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get unprocessed inbound payload for a case
   */
  async getUnprocessedPayload(caseNumber: string): Promise<CaseClassificationInbound | undefined> {
    const db = getDb();
    if (!db) return undefined;

    try {
      const result = await db
        .select()
        .from(caseClassificationInbound)
        .where(
          and(
            eq(caseClassificationInbound.caseNumber, caseNumber),
            eq(caseClassificationInbound.processed, false)
          )
        )
        .orderBy(desc(caseClassificationInbound.createdAt))
        .limit(1);

      return result[0];
    } catch (error) {
      console.error(`[DB] Error getting unprocessed payload for case ${caseNumber}:`, error);
      return undefined;
    }
  }

  /**
   * Mark inbound payload as processed
   */
  async markPayloadAsProcessed(id: number, workflowId?: string, error?: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(caseClassificationInbound)
        .set({
          processed: true,
          processedAt: new Date(),
          workflowId,
          processingError: error,
        })
        .where(eq(caseClassificationInbound.id, id));

      console.log(`[DB] Marked payload ${id} as processed`);
    } catch (error) {
      console.error(`[DB] Error marking payload ${id} as processed:`, error);
      throw error;
    }
  }

  /**
   * Save classification result
   */
  async saveClassificationResult(data: NewCaseClassificationResults): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db.insert(caseClassificationResults).values(data);
      console.log(`[DB] Saved classification result for case ${data.caseNumber}`);
    } catch (error) {
      console.error(`[DB] Error saving classification result for case ${data.caseNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get latest classification result for a case
   */
  async getLatestClassificationResult(caseNumber: string): Promise<CaseClassificationResults | undefined> {
    const db = getDb();
    if (!db) return undefined;

    try {
      const result = await db
        .select()
        .from(caseClassificationResults)
        .where(eq(caseClassificationResults.caseNumber, caseNumber))
        .orderBy(desc(caseClassificationResults.createdAt))
        .limit(1);

      return result[0];
    } catch (error) {
      console.error(`[DB] Error getting latest classification result for case ${caseNumber}:`, error);
      return undefined;
    }
  }

  /**
   * Get classification results by workflow ID
   */
  async getClassificationsByWorkflow(workflowId: string, limit: number = 10): Promise<CaseClassificationResults[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const results = await db
        .select()
        .from(caseClassificationResults)
        .where(eq(caseClassificationResults.workflowId, workflowId))
        .orderBy(desc(caseClassificationResults.createdAt))
        .limit(limit);

      return results;
    } catch (error) {
      console.error(`[DB] Error getting classifications for workflow ${workflowId}:`, error);
      return [];
    }
  }

  /**
   * Save discovered entities
   */
  async saveDiscoveredEntities(entities: NewCaseDiscoveredEntities[]): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      if (!entities.length) {
        return;
      }

      await db
        .insert(caseDiscoveredEntities)
        .values(entities)
        .onConflictDoNothing();
      console.log(`[DB] Saved ${entities.length} discovered entities`);
    } catch (error) {
      console.error(`[DB] Error saving discovered entities:`, error);
      throw error;
    }
  }

  /**
   * Get discovered entities for a case
   */
  async getDiscoveredEntities(caseNumber: string): Promise<CaseDiscoveredEntities[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const results = await db
        .select()
        .from(caseDiscoveredEntities)
        .where(eq(caseDiscoveredEntities.caseNumber, caseNumber))
        .orderBy(desc(caseDiscoveredEntities.confidence));

      return results;
    } catch (error) {
      console.error(`[DB] Error getting discovered entities for case ${caseNumber}:`, error);
      return [];
    }
  }

  /**
   * Update entity status
   */
  async updateEntityStatus(id: number, status: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(caseDiscoveredEntities)
        .set({ 
          status, 
          updatedAt: new Date() 
        })
        .where(eq(caseDiscoveredEntities.id, id));

      console.log(`[DB] Updated entity ${id} status to ${status}`);
    } catch (error) {
      console.error(`[DB] Error updating entity ${id} status:`, error);
      throw error;
    }
  }

  /**
   * Get classification statistics
   */
  async getClassificationStats(days: number = 7): Promise<{
    totalClassifications: number;
    averageProcessingTime: number;
    averageConfidence: number;
    topWorkflows: Array<{ workflowId: string; count: number }>;
  }> {
    const db = getDb();
    if (!db) return {
      totalClassifications: 0,
      averageProcessingTime: 0,
      averageConfidence: 0,
      topWorkflows: []
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const results = await db
        .select()
        .from(caseClassificationResults)
        .where(gt(caseClassificationResults.createdAt, cutoffDate));

      const totalClassifications = results.length;
      const averageProcessingTime = results.length > 0 
        ? results.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0) / results.length 
        : 0;
      const averageConfidence = results.length > 0
        ? results.reduce((sum, r) => sum + (r.confidenceScore || 0), 0) / results.length
        : 0;

      // Count by workflow
      const workflowCounts: Record<string, number> = {};
      results.forEach(r => {
        workflowCounts[r.workflowId] = (workflowCounts[r.workflowId] || 0) + 1;
      });

      const topWorkflows = Object.entries(workflowCounts)
        .map(([workflowId, count]) => ({ workflowId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        totalClassifications,
        averageProcessingTime,
        averageConfidence,
        topWorkflows
      };
    } catch (error) {
      console.error(`[DB] Error getting classification stats:`, error);
      return {
        totalClassifications: 0,
        averageProcessingTime: 0,
        averageConfidence: 0,
        topWorkflows: []
      };
    }
  }

  /**
   * Clean up old classification data
   */
  async cleanupOldData(maxAgeDays: number = 30): Promise<{
    inboundDeleted: number;
    resultsDeleted: number;
    entitiesDeleted: number;
  }> {
    const db = getDb();
    if (!db) return {
      inboundDeleted: 0,
      resultsDeleted: 0,
      entitiesDeleted: 0
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

      // Delete old inbound payloads
      const inboundResult = await db
        .delete(caseClassificationInbound)
        .where(lt(caseClassificationInbound.createdAt, cutoffDate));

      // Delete old classification results
      const resultsResult = await db
        .delete(caseClassificationResults)
        .where(lt(caseClassificationResults.createdAt, cutoffDate));

      // Delete old entities
      const entitiesResult = await db
        .delete(caseDiscoveredEntities)
        .where(lt(caseDiscoveredEntities.createdAt, cutoffDate));

      const result = {
        inboundDeleted: inboundResult.rowCount || 0,
        resultsDeleted: resultsResult.rowCount || 0,
        entitiesDeleted: entitiesResult.rowCount || 0
      };

      console.log(`[DB] Cleanup completed:`, result);
      return result;
    } catch (error) {
      console.error(`[DB] Error during cleanup:`, error);
      return {
        inboundDeleted: 0,
        resultsDeleted: 0,
        entitiesDeleted: 0
      };
    }
  }
}

// Singleton instance
let repository: CaseClassificationRepository | null = null;

export function getCaseClassificationRepository(): CaseClassificationRepository {
  if (!repository) {
    repository = new CaseClassificationRepository();
  }
  return repository;
}
