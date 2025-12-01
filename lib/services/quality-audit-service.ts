/**
 * Quality Audit Service
 * 
 * Provides comprehensive audit logging for quality control system
 * Essential for compliance and forensic analysis
 */

import { eq, and, sql, gte, lte, desc, count } from "drizzle-orm";
import type { QualityAuditTrail } from "../db/quality-gate-schema";
import { qualityAuditTrail, qualityGateRecords } from "../db/quality-gate-schema";
import { getDb } from "../db/client";

export interface QualityAuditRecord {
  entityType: 'QUALITY_GATE' | 'CLARIFICATION_SESSION' | 'CLASSIFICATION' | 'ESCALATION' | 'KB_GENERATION' | 'CHANGE_VALIDATION';
  entityId: string;
  action: 'CREATED' | 'UPDATED' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'EXPIRED' | 'RESUMED' | 'BLOCKED' | 'RESPONDED' | 'RESOLVED' | 'CANCELLED';
  previousState?: any;
  newState?: any;
  reason?: string;
  performedBy: string;
  performedAt: Date;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class QualityAuditService {
  /**
   * Create audit record for quality control actions
   */
  async createAuditRecord(record: Omit<QualityAuditRecord, "id" | "performedAt">): Promise<void> {
    try {
      const db = getDb();
      if (!db) {
        console.warn("[Quality Audit] Database not available, skipping audit record");
        return;
      }
      await db.insert(qualityAuditTrail).values({
        ...record,
        performedAt: new Date(),
      });

      console.log(`[Quality Audit] Created audit record: ${record.entityType}:${record.action} for ${record.entityId}`);
    } catch (error) {
      console.error("[Quality Audit] Error creating audit record:", error);
      throw error;
    }
  }

  /**
   * Log quality gate decision
   */
  async logQualityGateDecision(
    qualityGateId: string,
    decision: any,
    blocked: boolean,
    riskLevel: string,
    reason?: string,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'QUALITY_GATE',
      entityId: qualityGateId,
      action: blocked ? 'BLOCKED' : 'APPROVED',
      previousState: null,
      newState: decision,
      reason: reason || (blocked ? 'Quality gate blocked processing' : 'Quality gate approved processing'),
      performedBy,
      metadata: {
        riskLevel,
        blocked,
        decision,
      }
    });
  }

  /**
   * Log clarification session lifecycle events
   */
  async logClarificationSessionEvent(
    sessionId: string,
    action: 'CREATED' | 'RESPONDED' | 'RESOLVED' | 'EXPIRED' | 'CANCELLED',
    previousStatus?: string,
    reason?: string,
    responses?: Record<string, any>,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'CLARIFICATION_SESSION',
      entityId: sessionId,
      action,
      previousState: previousStatus ? { status: previousStatus } : null,
      newState: { status: action },
      reason,
      performedBy,
      metadata: responses ? { responses } : undefined,
    });
  }

  /**
   * Log clarification session response
   */
  async logClarificationResponse(
    sessionId: string,
    responses: Record<string, any>,
    confidence: number,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'CLARIFICATION_SESSION',
      entityId: sessionId,
      action: 'RESPONDED',
      previousState: { status: 'ACTIVE' },
      newState: { status: 'RESPONDED', responses, confidence },
      reason: `User provided ${Object.keys(responses).length} responses with ${confidence.toFixed(1)}% confidence`,
      performedBy,
      metadata: { responses, confidence }
    });
  }

  /**
   * Log clarification session completion
   */
  async logClarificationCompletion(
    sessionId: string,
    nextSteps: string[],
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'CLARIFICATION_SESSION',
      entityId: sessionId,
      action: 'RESOLVED',
      previousState: { status: 'RESPONDED' },
      newState: { status: 'RESOLVED', nextSteps },
      reason: `Clarification completed with ${nextSteps.length} next steps`,
      performedBy,
      metadata: { nextSteps }
    });
  }

  /**
   * Log clarification session expiration
   */
  async logClarificationExpiration(
    sessionId: string,
    reason: string,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'CLARIFICATION_SESSION',
      entityId: sessionId,
      action: 'EXPIRED',
      previousState: { status: 'ACTIVE' },
      newState: { status: 'EXPIRED' },
      reason,
      performedBy,
    });
  }

  /**
   * Log classification validation
   */
  async logClassificationValidation(
    classificationId: string,
    validationResult: any,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'CLASSIFICATION',
      entityId: classificationId,
      action: validationResult.approved ? 'APPROVED' : 'REJECTED',
      previousState: null,
      newState: validationResult,
      reason: validationResult.reason || `Classification ${validationResult.approved ? 'approved' : 'rejected'}`,
      performedBy,
      metadata: validationResult
    });
  }

  /**
   * Log escalation decision
   */
  async logEscalationDecision(
    escalationId: string,
    decision: any,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'ESCALATION',
      entityId: escalationId,
      action: decision.escalated ? 'ESCALATED' : 'APPROVED',
      previousState: null,
      newState: decision,
      reason: decision.reason || `Escalation ${decision.escalated ? 'triggered' : 'approved'}`,
      performedBy,
      metadata: decision
    });
  }

  /**
   * Get audit trail for entity
   */
  async getAuditTrail(
    entityType: string,
    entityId: string,
    limit?: number
  ): Promise<QualityAuditTrail[]> {
    const db = getDb();
    if (!db) {
      console.warn("[Quality Audit] Database not available");
      return [];
    }
    const baseQuery = db
      .select()
      .from(qualityAuditTrail)
      .where(
        and(
          eq(qualityAuditTrail.entityType, entityType),
          eq(qualityAuditTrail.entityId, entityId)
        )
      )
      .orderBy(desc(qualityAuditTrail.performedAt));

    if (limit) {
      return await baseQuery.limit(limit);
    }

    return await baseQuery;
  }

  /**
   * Get audit trail for time range
   */
  async getAuditTrailByDateRange(
    entityType: string,
    startDate: Date,
    endDate: Date,
    limit?: number
  ): Promise<QualityAuditTrail[]> {
    const db = getDb();
    if (!db) {
      console.warn("[Quality Audit] Database not available");
      return [];
    }
    const baseQuery = db
      .select()
      .from(qualityAuditTrail)
      .where(
        and(
          eq(qualityAuditTrail.entityType, entityType),
          gte(qualityAuditTrail.performedAt, startDate),
          lte(qualityAuditTrail.performedAt, endDate)
        )
      )
      .orderBy(desc(qualityAuditTrail.performedAt));

    if (limit) {
      return await baseQuery.limit(limit);
    }

    return await baseQuery;
  }

  /**
   * Get quality metrics for reporting
   */
  async getQualityMetrics(
    timeWindow: { hours?: number; days?: number } = { hours: 24 }
  ): Promise<{
    totalGates: number;
    approvedGates: number;
    rejectedGates: number;
    blockedGates: number;
    clarificationNeededGates: number;
    averageConfidence: number;
    averageProcessingTimeMs: number;
    approvalRate: number;
    blockRate: number;
  }> {
    const db = getDb();
    if (!db) {
      console.warn("[Quality Audit] Database not available");
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

    const cutoffDate = new Date(Date.now() - (timeWindow.hours || 24) * 60 * 60 * 1000);

    const metrics = await db
      .select({
        totalGates: count(qualityGateRecords.id),
        approvedGates: sql<number>`count(case when ${qualityGateRecords.status} = 'APPROVED' then 1 end)`,
        rejectedGates: sql<number>`count(case when ${qualityGateRecords.status} = 'REJECTED' then 1 end)`,
        blockedGates: sql<number>`count(case when ${qualityGateRecords.blocked} = true then 1 end)`,
        clarificationNeededGates: sql<number>`count(case when ${qualityGateRecords.status} = 'CLARIFICATION_NEEDED' then 1 end)`,
      })
      .from(qualityGateRecords)
      .where(gte(qualityGateRecords.createdAt, cutoffDate));

    const result = metrics[0] || {
      totalGates: 0,
      approvedGates: 0,
      rejectedGates: 0,
      blockedGates: 0,
      clarificationNeededGates: 0,
    };

    const approvalRate = result.totalGates > 0 ? (result.approvedGates / result.totalGates) * 100 : 0;
    const blockRate = result.totalGates > 0 ? (result.blockedGates / result.totalGates) * 100 : 0;

    return {
      totalGates: result.totalGates,
      approvedGates: result.approvedGates,
      rejectedGates: result.rejectedGates,
      blockedGates: result.blockedGates,
      clarificationNeededGates: result.clarificationNeededGates,
      averageConfidence: 0, // TODO: Calculate from decision JSONB
      averageProcessingTimeMs: 0, // TODO: Calculate from decision JSONB
      approvalRate,
      blockRate,
    };
  }

  /**
   * Log resume action after clarification
   */
  async logResumeAction(
    sessionId: string,
    caseNumber: string,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'CLARIFICATION_SESSION',
      entityId: sessionId,
      action: 'RESUMED',
      previousState: { status: 'RESOLVED' },
      newState: { status: 'RESUMED', caseNumber },
      reason: `Case ${caseNumber} processing resumed after clarification`,
      performedBy,
      metadata: { caseNumber, resumedAt: new Date().toISOString() }
    });
  }

  /**
   * Log session expiration
   */
  async logSessionExpiration(
    sessionId: string,
    caseNumber: string,
    performedBy: string = 'system'
  ): Promise<void> {
    await this.createAuditRecord({
      entityType: 'CLARIFICATION_SESSION',
      entityId: sessionId,
      action: 'EXPIRED',
      previousState: { status: 'ACTIVE' },
      newState: { status: 'EXPIRED', caseNumber },
      reason: `Clarification session for case ${caseNumber} expired without response`,
      performedBy,
      metadata: { caseNumber, expiredAt: new Date().toISOString() }
    });
  }
}

/**
 * Get quality audit service instance
 */
export function getQualityAuditService(): QualityAuditService {
  return new QualityAuditService();
}