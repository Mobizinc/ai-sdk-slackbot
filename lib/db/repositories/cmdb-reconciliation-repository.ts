import { getDb } from "../client";
import { 
  cmdbReconciliationResults, 
  CmdbReconciliationResult, 
  NewCmdbReconciliationResult 
} from "../schema";
import { eq, desc } from "drizzle-orm";

export class CmdbReconciliationRepository {
  private getDb() {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    return db;
  }

  /**
   * Create a new CMDB reconciliation result record
   */
  async create(result: NewCmdbReconciliationResult): Promise<CmdbReconciliationResult> {
    const db = this.getDb();
    const [created] = await db
      .insert(cmdbReconciliationResults)
      .values(result)
      .returning();
    
    return created;
  }

  /**
   * Get reconciliation results by case number
   */
  async getByCaseNumber(caseNumber: string): Promise<CmdbReconciliationResult[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(cmdbReconciliationResults)
      .where(eq(cmdbReconciliationResults.caseNumber, caseNumber))
      .orderBy(desc(cmdbReconciliationResults.createdAt));
  }

  /**
   * Get reconciliation results by case sys_id
   */
  async getByCaseSysId(caseSysId: string): Promise<CmdbReconciliationResult[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(cmdbReconciliationResults)
      .where(eq(cmdbReconciliationResults.caseSysId, caseSysId))
      .orderBy(desc(cmdbReconciliationResults.createdAt));
  }

  /**
   * Get reconciliation result by ID
   */
  async findById(id: number): Promise<CmdbReconciliationResult | null> {
    const db = this.getDb();
    const [result] = await db
      .select()
      .from(cmdbReconciliationResults)
      .where(eq(cmdbReconciliationResults.id, id))
      .limit(1);
    
    return result || null;
  }

  /**
   * Update reconciliation result with CMDB match information
   */
  async updateWithMatch(
    id: number,
    matchData: {
      cmdbSysId: string;
      cmdbName: string;
      cmdbClass?: string;
      cmdbUrl: string;
      confidence: number;
    }
  ): Promise<CmdbReconciliationResult> {
    const db = this.getDb();
    const [updated] = await db
      .update(cmdbReconciliationResults)
      .set({
        ...matchData,
        reconciliationStatus: "matched",
        updatedAt: new Date(),
      })
      .where(eq(cmdbReconciliationResults.id, id))
      .returning();
    
    return updated;
  }

  /**
   * Update reconciliation result with child task information
   */
  async updateWithChildTask(
    id: number,
    taskData: {
      childTaskNumber: string;
      childTaskSysId: string;
    }
  ): Promise<CmdbReconciliationResult> {
    const db = this.getDb();
    const [updated] = await db
      .update(cmdbReconciliationResults)
      .set({
        ...taskData,
        reconciliationStatus: "unmatched",
        updatedAt: new Date(),
      })
      .where(eq(cmdbReconciliationResults.id, id))
      .returning();
    
    return updated;
  }

  /**
   * Mark reconciliation result as skipped (e.g., unresolved alias)
   */
  async markAsSkipped(
    id: number,
    reason: string
  ): Promise<CmdbReconciliationResult> {
    const db = this.getDb();
    const [updated] = await db
      .update(cmdbReconciliationResults)
      .set({
        reconciliationStatus: "skipped",
        errorMessage: reason,
        updatedAt: new Date(),
      })
      .where(eq(cmdbReconciliationResults.id, id))
      .returning();
    
    return updated;
  }

  /**
   * Mark reconciliation result as ambiguous (multiple matches)
   */
  async markAsAmbiguous(
    id: number,
    details: string
  ): Promise<CmdbReconciliationResult> {
    const db = this.getDb();
    const [updated] = await db
      .update(cmdbReconciliationResults)
      .set({
        reconciliationStatus: "ambiguous",
        errorMessage: details,
        updatedAt: new Date(),
      })
      .where(eq(cmdbReconciliationResults.id, id))
      .returning();
    
    return updated;
  }

  /**
   * Get reconciliation statistics for a case
   */
  async getCaseStatistics(caseNumber: string): Promise<{
    total: number;
    matched: number;
    unmatched: number;
    skipped: number;
    ambiguous: number;
  }> {
    const results = await this.getByCaseNumber(caseNumber);
    
    return {
      total: results.length,
      matched: results.filter(r => r.reconciliationStatus === "matched").length,
      unmatched: results.filter(r => r.reconciliationStatus === "unmatched").length,
      skipped: results.filter(r => r.reconciliationStatus === "skipped").length,
      ambiguous: results.filter(r => r.reconciliationStatus === "ambiguous").length,
    };
  }

  /**
   * Get recent reconciliation results across all cases
   */
  async getRecent(limit: number = 50): Promise<CmdbReconciliationResult[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(cmdbReconciliationResults)
      .orderBy(desc(cmdbReconciliationResults.createdAt))
      .limit(limit);
  }

  /**
   * Get unmatched entities that need CI creation
   */
  async getUnmatchedEntities(limit: number = 20): Promise<CmdbReconciliationResult[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(cmdbReconciliationResults)
      .where(eq(cmdbReconciliationResults.reconciliationStatus, "unmatched"))
      .orderBy(desc(cmdbReconciliationResults.createdAt))
      .limit(limit);
  }
}

// Singleton instance
let cmdbReconciliationRepository: CmdbReconciliationRepository | null = null;

export function getCmdbReconciliationRepository(): CmdbReconciliationRepository {
  if (!cmdbReconciliationRepository) {
    cmdbReconciliationRepository = new CmdbReconciliationRepository();
  }
  return cmdbReconciliationRepository;
}