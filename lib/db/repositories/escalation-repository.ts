/**
 * Case Escalation Repository
 * Handles persistence of case escalation records and tracking
 */

import { eq, and, desc, gte } from "drizzle-orm";
import { getDb } from "../client";
import { caseEscalations } from "../schema";
import type { NewCaseEscalation, CaseEscalation } from "../schema";

export class EscalationRepository {
  /**
   * Create a new escalation record
   */
  async createEscalation(escalation: NewCaseEscalation): Promise<CaseEscalation | null> {
    const db = getDb();
    if (!db) {
      console.warn("[Escalation Repository] Database not available - skipping escalation persistence");
      return null;
    }

    try {
      const result = await db
        .insert(caseEscalations)
        .values(escalation)
        .returning();

      const created = result[0];
      if (created) {
        console.log(
          `[Escalation Repository] Created escalation ${created.id} for case ${escalation.caseNumber}`
        );
      }
      return created || null;
    } catch (error) {
      console.error(
        `[Escalation Repository] Error creating escalation for ${escalation.caseNumber}:`,
        error
      );
      return null;
    }
  }

  /**
   * Check if a case has any recent active escalations
   * Used to prevent duplicate escalation notifications
   *
   * @param caseNumber Case number to check
   * @param withinHours Only check escalations created within this many hours
   * @returns true if active escalation exists
   */
  async hasRecentActiveEscalation(
    caseNumber: string,
    withinHours: number = 24
  ): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    try {
      const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);

      const results = await db
        .select()
        .from(caseEscalations)
        .where(
          and(
            eq(caseEscalations.caseNumber, caseNumber),
            eq(caseEscalations.status, "active"),
            gte(caseEscalations.createdAt, since)
          )
        )
        .limit(1);

      return results.length > 0;
    } catch (error) {
      console.error(
        `[Escalation Repository] Error checking recent escalations for ${caseNumber}:`,
        error
      );
      return false;
    }
  }

  /**
   * Get all active escalations for a case
   */
  async getActiveEscalations(caseNumber: string): Promise<CaseEscalation[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(caseEscalations)
        .where(
          and(
            eq(caseEscalations.caseNumber, caseNumber),
            eq(caseEscalations.status, "active")
          )
        )
        .orderBy(desc(caseEscalations.createdAt));
    } catch (error) {
      console.error(
        `[Escalation Repository] Error fetching active escalations for ${caseNumber}:`,
        error
      );
      return [];
    }
  }

  /**
   * Get escalation by Slack message timestamp
   * Used to handle interactive button actions
   */
  async getEscalationByMessageTs(
    slackChannel: string,
    slackMessageTs: string
  ): Promise<CaseEscalation | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(caseEscalations)
        .where(
          and(
            eq(caseEscalations.slackChannel, slackChannel),
            eq(caseEscalations.slackMessageTs, slackMessageTs)
          )
        )
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(
        `[Escalation Repository] Error fetching escalation by message ts:`,
        error
      );
      return null;
    }
  }

  /**
   * Acknowledge an escalation (user pressed button)
   */
  async acknowledgeEscalation(
    escalationId: string,
    acknowledgedBy: string,
    action: string
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(caseEscalations)
        .set({
          status: "acknowledged",
          acknowledgedBy,
          acknowledgedAction: action,
          acknowledgedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(caseEscalations.id, escalationId));

      console.log(
        `[Escalation Repository] Acknowledged escalation ${escalationId} by ${acknowledgedBy} (action: ${action})`
      );
    } catch (error) {
      console.error(
        `[Escalation Repository] Error acknowledging escalation ${escalationId}:`,
        error
      );
    }
  }

  /**
   * Dismiss an escalation (marked as not needed)
   */
  async dismissEscalation(escalationId: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(caseEscalations)
        .set({
          status: "dismissed",
          updatedAt: new Date(),
        })
        .where(eq(caseEscalations.id, escalationId));

      console.log(`[Escalation Repository] Dismissed escalation ${escalationId}`);
    } catch (error) {
      console.error(
        `[Escalation Repository] Error dismissing escalation ${escalationId}:`,
        error
      );
    }
  }

  /**
   * Resolve an escalation (case was resolved)
   */
  async resolveEscalation(escalationId: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(caseEscalations)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(caseEscalations.id, escalationId));

      console.log(`[Escalation Repository] Resolved escalation ${escalationId}`);
    } catch (error) {
      console.error(
        `[Escalation Repository] Error resolving escalation ${escalationId}:`,
        error
      );
    }
  }

  /**
   * Auto-resolve all active escalations for a case
   * Called when case is closed/resolved in ServiceNow
   */
  async autoResolveEscalationsForCase(caseNumber: string): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    try {
      const result = await db
        .update(caseEscalations)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(caseEscalations.caseNumber, caseNumber),
            eq(caseEscalations.status, "active")
          )
        );

      console.log(
        `[Escalation Repository] Auto-resolved escalations for ${caseNumber}`
      );
      return result.rowCount || 0;
    } catch (error) {
      console.error(
        `[Escalation Repository] Error auto-resolving escalations for ${caseNumber}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Get escalation statistics for reporting
   */
  async getEscalationStats(days: number = 7): Promise<{
    totalEscalations: number;
    activeEscalations: number;
    acknowledgedEscalations: number;
    averageResponseTime: number;
    topReasons: Array<{ reason: string; count: number }>;
  }> {
    const db = getDb();
    if (!db) {
      return {
        totalEscalations: 0,
        activeEscalations: 0,
        acknowledgedEscalations: 0,
        averageResponseTime: 0,
        topReasons: [],
      };
    }

    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get total escalations
      const allEscalations = await db
        .select()
        .from(caseEscalations)
        .where(gte(caseEscalations.createdAt, since));

      const totalEscalations = allEscalations.length;
      const activeEscalations = allEscalations.filter((e) => e.status === "active").length;
      const acknowledgedEscalations = allEscalations.filter(
        (e) => e.status === "acknowledged"
      ).length;

      // Calculate average response time (time to acknowledgment)
      const acknowledgedWithTime = allEscalations.filter(
        (e) => e.acknowledgedAt && e.createdAt
      );
      const totalResponseTime = acknowledgedWithTime.reduce((sum, e) => {
        const responseTime =
          e.acknowledgedAt!.getTime() - e.createdAt.getTime();
        return sum + responseTime;
      }, 0);
      const averageResponseTime =
        acknowledgedWithTime.length > 0
          ? totalResponseTime / acknowledgedWithTime.length
          : 0;

      // Get top reasons
      const reasonCounts = allEscalations.reduce((acc, e) => {
        acc[e.escalationReason] = (acc[e.escalationReason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topReasons = Object.entries(reasonCounts)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        totalEscalations,
        activeEscalations,
        acknowledgedEscalations,
        averageResponseTime: averageResponseTime / 1000 / 60, // Convert to minutes
        topReasons,
      };
    } catch (error) {
      console.error("[Escalation Repository] Error getting escalation stats:", error);
      return {
        totalEscalations: 0,
        activeEscalations: 0,
        acknowledgedEscalations: 0,
        averageResponseTime: 0,
        topReasons: [],
      };
    }
  }
}

// Singleton instance
let repositoryInstance: EscalationRepository | null = null;

export function getEscalationRepository(): EscalationRepository {
  if (!repositoryInstance) {
    repositoryInstance = new EscalationRepository();
  }
  return repositoryInstance;
}
