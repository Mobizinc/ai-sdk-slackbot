/**
 * Change Validation Repository
 * Handles persistence of ServiceNow change validation requests and results
 */

import { eq, and, desc, gte } from "drizzle-orm";
import { getDb } from "../client";
import { changeValidations } from "../schema";
import type { NewChangeValidation, ChangeValidation } from "../schema";
import { withWriteRetry, withQueryRetry } from "../retry-wrapper";

export class ChangeValidationRepository {
  /**
   * Create a new change validation record
   */
  async create(data: NewChangeValidation): Promise<ChangeValidation> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    return await withWriteRetry(async () => {
      const result = await db
        .insert(changeValidations)
        .values(data)
        .returning();

      if (!result[0]) {
        throw new Error("Failed to create change validation record");
      }

      console.log(`[DB] Created change validation: ${data.changeNumber} (${data.changeSysId})`);
      return result[0];
    }, `create change validation for ${data.changeNumber}`);
  }

  /**
   * Get a change validation by sys_id
   */
  async getByChangeSysId(changeSysId: string): Promise<ChangeValidation | null> {
    const db = getDb();
    if (!db) return null;

    return await withQueryRetry(async () => {
      const result = await db
        .select()
        .from(changeValidations)
        .where(eq(changeValidations.changeSysId, changeSysId))
        .limit(1);

      return result[0] || null;
    }, `get change validation by sys_id ${changeSysId}`);
  }

  /**
   * Get a change validation by change number
   */
  async getByChangeNumber(changeNumber: string): Promise<ChangeValidation | null> {
    const db = getDb();
    if (!db) return null;

    return await withQueryRetry(async () => {
      const result = await db
        .select()
        .from(changeValidations)
        .where(eq(changeValidations.changeNumber, changeNumber))
        .limit(1);

      return result[0] || null;
    }, `get change validation by change number ${changeNumber}`);
  }

  /**
   * Update a change validation record
   */
  async update(changeSysId: string, data: Partial<NewChangeValidation>): Promise<ChangeValidation> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    return await withWriteRetry(async () => {
      const result = await db
        .update(changeValidations)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(changeValidations.changeSysId, changeSysId))
        .returning();

      if (!result[0]) {
        throw new Error(`Failed to update change validation: ${changeSysId}`);
      }

      console.log(`[DB] Updated change validation: ${changeSysId}`);
      return result[0];
    }, `update change validation ${changeSysId}`);
  }

  /**
   * Mark a change validation as processing
   */
  async markProcessing(changeSysId: string): Promise<ChangeValidation> {
    return this.update(changeSysId, {
      status: "processing",
    });
  }

  /**
   * Mark a change validation as completed
   */
  async markCompleted(
    changeSysId: string,
    validationResults: ChangeValidation["validationResults"],
    processingTimeMs: number
  ): Promise<ChangeValidation> {
    return this.update(changeSysId, {
      status: "completed",
      validationResults,
      processedAt: new Date(),
      processingTimeMs,
    });
  }

  /**
   * Mark a change validation as failed
   */
  async markFailed(
    changeSysId: string,
    failureReason: string,
    processingTimeMs: number
  ): Promise<ChangeValidation> {
    return this.update(changeSysId, {
      status: "failed",
      failureReason,
      processedAt: new Date(),
      processingTimeMs,
    });
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(changeSysId: string): Promise<ChangeValidation> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const current = await this.getByChangeSysId(changeSysId);
    if (!current) {
      throw new Error(`Change validation not found: ${changeSysId}`);
    }

    return this.update(changeSysId, {
      retryCount: (current.retryCount || 0) + 1,
    });
  }

  /**
   * Get unprocessed validations (for background job processing)
   */
  async getUnprocessed(limit: number = 10): Promise<ChangeValidation[]> {
    const db = getDb();
    if (!db) return [];

    return await withQueryRetry(async () => {
      return await db
        .select()
        .from(changeValidations)
        .where(eq(changeValidations.status, "received"))
        .orderBy(changeValidations.createdAt)
        .limit(limit);
    }, `get unprocessed validations`);
  }

  /**
   * Get validation results by component type
   */
  async getByComponentType(
    componentType: string,
    limit: number = 50
  ): Promise<ChangeValidation[]> {
    const db = getDb();
    if (!db) return [];

    return await withQueryRetry(async () => {
      return await db
        .select()
        .from(changeValidations)
        .where(eq(changeValidations.componentType, componentType))
        .orderBy(desc(changeValidations.createdAt))
        .limit(limit);
    }, `get validations by component type ${componentType}`);
  }

  /**
   * Get recent validations by status
   */
  async getRecentByStatus(
    status: string,
    limitDays: number = 7,
    limit: number = 50
  ): Promise<ChangeValidation[]> {
    const db = getDb();
    if (!db) return [];

    const since = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000);

    return await withQueryRetry(async () => {
      return await db
        .select()
        .from(changeValidations)
        .where(
          and(
            eq(changeValidations.status, status),
            gte(changeValidations.createdAt, since)
          )
        )
        .orderBy(desc(changeValidations.createdAt))
        .limit(limit);
    }, `get recent validations with status ${status}`);
  }

  /**
   * Get validation statistics
   */
  async getStats(limitDays: number = 30): Promise<{
    total: number;
    passed: number;
    failed: number;
    warning: number;
    pending: number;
    avgProcessingTimeMs: number;
  }> {
    const db = getDb();
    if (!db) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        warning: 0,
        pending: 0,
        avgProcessingTimeMs: 0,
      };
    }

    try {
      const since = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000);

      const results = await db
        .select()
        .from(changeValidations)
        .where(gte(changeValidations.createdAt, since));

      const stats = {
        total: results.length,
        passed: 0,
        failed: 0,
        warning: 0,
        pending: 0,
        avgProcessingTimeMs: 0,
      };

      let totalProcessingTime = 0;
      let processedCount = 0;

      results.forEach((r) => {
        const overallStatus = r.validationResults?.overall_status;
        if (r.status === "pending" || r.status === "received") {
          stats.pending++;
        } else if (overallStatus === "PASSED") {
          stats.passed++;
        } else if (overallStatus === "FAILED") {
          stats.failed++;
        } else if (overallStatus === "WARNING") {
          stats.warning++;
        }

        if (r.processingTimeMs) {
          totalProcessingTime += r.processingTimeMs;
          processedCount++;
        }
      });

      if (processedCount > 0) {
        stats.avgProcessingTimeMs = Math.round(totalProcessingTime / processedCount);
      }

      return stats;
    } catch (error) {
      console.error("[DB] Error getting validation stats:", error);
      return {
        total: 0,
        passed: 0,
        failed: 0,
        warning: 0,
        pending: 0,
        avgProcessingTimeMs: 0,
      };
    }
  }
}

// Singleton instance
let instance: ChangeValidationRepository;

export function getChangeValidationRepository(): ChangeValidationRepository {
  if (!instance) {
    instance = new ChangeValidationRepository();
  }
  return instance;
}
