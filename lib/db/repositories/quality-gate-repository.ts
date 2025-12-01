/**
 * Quality Gate Repository
 * 
 * Database repository for quality gate records and audit trail
 * Provides persistent storage for quality control decisions
 */

import { eq, and, count, gte, lte, desc, sql } from "drizzle-orm";
import type { QualityGateRecord } from "../quality-gate-schema";
import { qualityGateRecords } from "../quality-gate-schema";
import { getDb } from "../client";

export interface QualityGateRepository {
  // Core CRUD operations
  create(record: Omit<QualityGateRecord, "id" | "createdAt">): Promise<QualityGateRecord>;
  getById(id: string): Promise<QualityGateRecord | null>;
  getByCaseNumber(caseNumber: string): Promise<QualityGateRecord | null>;
  update(id: string, updates: Partial<QualityGateRecord>): Promise<QualityGateRecord>;
  delete(id: string): Promise<void>;
  
  // Query operations
  findMany(filters: QualityGateFilters): Promise<QualityGateRecord[]>;
  findByStatus(status: string): Promise<QualityGateRecord[]>;
  findByRiskLevel(riskLevel: string): Promise<QualityGateRecord[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<QualityGateRecord[]>;
  
  // Analytics operations
  getMetrics(filters: QualityGateMetricsFilters): Promise<QualityGateMetrics>;
  getBlockedCount(timeWindow?: { hours?: number }): Promise<number>;
  getApprovalRate(timeWindow?: { hours?: number }): Promise<number>;
}

export interface QualityGateFilters {
  caseNumber?: string;
  status?: string;
  gateType?: string;
  riskLevel?: string;
  blocked?: boolean;
  dateRange?: { start: Date; end: Date };
  limit?: number;
  offset?: number;
}

export interface QualityGateMetricsFilters {
  timeWindow?: { hours?: number; days?: number };
  gateType?: string;
  riskLevel?: string;
}

export interface QualityGateMetrics {
  totalGates: number;
  approvedGates: number;
  rejectedGates: number;
  blockedGates: number;
  clarificationNeededGates: number;
  averageConfidence: number;
  averageProcessingTimeMs: number;
  approvalRate: number;
  blockRate: number;
}

export class PostgresQualityGateRepository implements QualityGateRepository {
  /**
   * Create a new quality gate record
   */
  async create(record: Omit<QualityGateRecord, "id" | "createdAt">): Promise<QualityGateRecord> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    const [newRecord] = await db
      .insert(qualityGateRecords)
      .values({
        ...record,
        createdAt: new Date(),
      })
      .returning();

    return newRecord;
  }

  /**
   * Get quality gate record by ID
   */
  async getById(id: string): Promise<QualityGateRecord | null> {
    const db = getDb();
    if (!db) {
      return null;
    }
    const records = await db
      .select()
      .from(qualityGateRecords)
      .where(eq(qualityGateRecords.id, id))
      .limit(1);

    return records[0] || null;
  }

  /**
   * Get quality gate record by case number
   */
  async getByCaseNumber(caseNumber: string): Promise<QualityGateRecord | null> {
    const db = getDb();
    if (!db) {
      return null;
    }
    const records = await db
      .select()
      .from(qualityGateRecords)
      .where(eq(qualityGateRecords.caseNumber, caseNumber))
      .orderBy(desc(qualityGateRecords.createdAt))
      .limit(1);

    return records[0] || null;
  }

  /**
   * Update quality gate record
   */
  async update(id: string, updates: Partial<QualityGateRecord>): Promise<QualityGateRecord> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    const [updatedRecord] = await db
      .update(qualityGateRecords)
      .set(updates)
      .where(eq(qualityGateRecords.id, id))
      .returning();

    if (!updatedRecord) {
      throw new Error(`Quality gate record not found: ${id}`);
    }

    return updatedRecord;
  }

  /**
   * Delete quality gate record
   */
  async delete(id: string): Promise<void> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    await db
      .delete(qualityGateRecords)
      .where(eq(qualityGateRecords.id, id));
  }

  /**
   * Find quality gate records with filters
   */
  async findMany(filters: QualityGateFilters): Promise<QualityGateRecord[]> {
    const db = getDb();
    if (!db) {
      return [];
    }

    const conditions: any[] = [];

    if (filters.caseNumber) {
      conditions.push(eq(qualityGateRecords.caseNumber, filters.caseNumber));
    }

    if (filters.status) {
      conditions.push(eq(qualityGateRecords.status, filters.status));
    }

    if (filters.gateType) {
      conditions.push(eq(qualityGateRecords.gateType, filters.gateType));
    }

    if (filters.riskLevel) {
      conditions.push(eq(qualityGateRecords.riskLevel, filters.riskLevel));
    }

    if (filters.blocked !== undefined) {
      conditions.push(eq(qualityGateRecords.blocked, filters.blocked));
    }

    if (filters.dateRange) {
      conditions.push(gte(qualityGateRecords.createdAt, filters.dateRange.start));
      conditions.push(lte(qualityGateRecords.createdAt, filters.dateRange.end));
    }

    const baseQuery = db
      .select()
      .from(qualityGateRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(qualityGateRecords.createdAt));

    // Apply limit and offset if provided
    if (filters.limit && filters.offset) {
      return await baseQuery.limit(filters.limit).offset(filters.offset);
    } else if (filters.limit) {
      return await baseQuery.limit(filters.limit);
    } else if (filters.offset) {
      return await baseQuery.offset(filters.offset);
    }

    return await baseQuery;
  }

  /**
   * Find quality gate records by status
   */
  async findByStatus(status: string): Promise<QualityGateRecord[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    return await db
      .select()
      .from(qualityGateRecords)
      .where(eq(qualityGateRecords.status, status))
      .orderBy(desc(qualityGateRecords.createdAt));
  }

  /**
   * Find quality gate records by risk level
   */
  async findByRiskLevel(riskLevel: string): Promise<QualityGateRecord[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    return await db
      .select()
      .from(qualityGateRecords)
      .where(eq(qualityGateRecords.riskLevel, riskLevel))
      .orderBy(desc(qualityGateRecords.createdAt));
  }

  /**
   * Find quality gate records by date range
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<QualityGateRecord[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    return await db
      .select()
      .from(qualityGateRecords)
      .where(
        and(
          gte(qualityGateRecords.createdAt, startDate),
          lte(qualityGateRecords.createdAt, endDate)
        )
      )
      .orderBy(desc(qualityGateRecords.createdAt));
  }

  /**
   * Get quality gate metrics
   */
  async getMetrics(filters: QualityGateMetricsFilters = {}): Promise<QualityGateMetrics> {
    const db = getDb();
    if (!db) {
      return {
        totalGates: 0,
        approvedGates: 0,
        rejectedGates: 0,
        blockedGates: 0,
        clarificationNeededGates: 0,
        averageConfidence: 0,
        averageProcessingTimeMs: 0,
        approvalRate: 0,
        blockRate: 0,
      };
    }

    const whereConditions: any[] = [];

    if (filters.timeWindow?.hours) {
      const cutoffDate = new Date(Date.now() - filters.timeWindow.hours * 60 * 60 * 1000);
      whereConditions.push(gte(qualityGateRecords.createdAt, cutoffDate));
    } else if (filters.timeWindow?.days) {
      const cutoffDate = new Date(Date.now() - filters.timeWindow.days * 24 * 60 * 60 * 1000);
      whereConditions.push(gte(qualityGateRecords.createdAt, cutoffDate));
    }

    if (filters.gateType) {
      whereConditions.push(eq(qualityGateRecords.gateType, filters.gateType));
    }

    if (filters.riskLevel) {
      whereConditions.push(eq(qualityGateRecords.riskLevel, filters.riskLevel));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const metrics = await db
      .select({
        totalGates: count(qualityGateRecords.id),
        approvedGates: sql<number>`count(case when ${qualityGateRecords.status} = 'APPROVED' then 1 end)`,
        rejectedGates: sql<number>`count(case when ${qualityGateRecords.status} = 'REJECTED' then 1 end)`,
        blockedGates: sql<number>`count(case when ${qualityGateRecords.blocked} = true then 1 end)`,
        clarificationNeededGates: sql<number>`count(case when ${qualityGateRecords.status} = 'CLARIFICATION_NEEDED' then 1 end)`,
      })
      .from(qualityGateRecords)
      .where(whereClause);

    const result = metrics[0] || {
      totalGates: 0,
      approvedGates: 0,
      rejectedGates: 0,
      blockedGates: 0,
      clarificationNeededGates: 0,
    };

    return {
      totalGates: result.totalGates,
      approvedGates: result.approvedGates,
      rejectedGates: result.rejectedGates,
      blockedGates: result.blockedGates,
      clarificationNeededGates: result.clarificationNeededGates,
      averageConfidence: 0, // TODO: Calculate from decision JSONB
      averageProcessingTimeMs: 0, // TODO: Calculate from decision JSONB
      approvalRate: result.totalGates > 0 ? (result.approvedGates / result.totalGates) * 100 : 0,
      blockRate: result.totalGates > 0 ? (result.blockedGates / result.totalGates) * 100 : 0,
    };
  }

  /**
   * Get blocked count in time window
   */
  async getBlockedCount(timeWindow: { hours?: number } = { hours: 24 }): Promise<number> {
    const db = getDb();
    if (!db) {
      return 0;
    }
    const cutoffDate = new Date(Date.now() - (timeWindow.hours || 24) * 60 * 60 * 1000);

    const result = await db
      .select({ count: count() })
      .from(qualityGateRecords)
      .where(
        and(
          eq(qualityGateRecords.blocked, true),
          gte(qualityGateRecords.createdAt, cutoffDate)
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * Get approval rate in time window
   */
  async getApprovalRate(timeWindow: { hours?: number } = { hours: 24 }): Promise<number> {
    const metrics = await this.getMetrics({ timeWindow });
    return metrics.approvalRate;
  }

  /**
   * Find stuck cases (blocked for longer than threshold)
   */
  async findStuckCases(options: { status: string; olderThanHours: number }): Promise<Array<QualityGateRecord & { blockedDurationHours: number }>> {
    const db = getDb();
    if (!db) {
      return [];
    }
    const cutoffDate = new Date(Date.now() - options.olderThanHours * 60 * 60 * 1000);

    const records = await db
      .select()
      .from(qualityGateRecords)
      .where(
        and(
          eq(qualityGateRecords.status, options.status),
          eq(qualityGateRecords.blocked, true),
          lte(qualityGateRecords.createdAt, cutoffDate)
        )
      )
      .orderBy(qualityGateRecords.createdAt);

    return records.map(record => ({
      ...record,
      blockedDurationHours: record.createdAt
        ? Math.floor((Date.now() - new Date(record.createdAt).getTime()) / (1000 * 60 * 60))
        : 0
    }));
  }
}

/**
 * Get quality gate repository instance
 */
export function getQualityGateRepository(): QualityGateRepository {
  return new PostgresQualityGateRepository();
}