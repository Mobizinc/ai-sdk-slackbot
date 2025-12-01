/**
 * Clarification Session Repository
 * 
 * Database repository for clarification session management
 * Handles interactive clarification workflow with users
 */

import { eq, and, count, gte, lte, desc, asc, sql } from "drizzle-orm";
import type { ClarificationSession } from "../quality-gate-schema";
import { clarificationSessions } from "../quality-gate-schema";
import { getDb } from "../client";

export interface ClarificationSessionRepository {
  // Core CRUD operations
  create(session: Omit<ClarificationSession, "id" | "createdAt" | "updatedAt">): Promise<ClarificationSession>;
  getById(id: string): Promise<ClarificationSession | null>;
  getBySessionId(sessionId: string): Promise<ClarificationSession | null>;
  update(id: string, updates: Partial<ClarificationSession>): Promise<ClarificationSession>;
  delete(id: string): Promise<void>;
  
  // Query operations
  findActive(): Promise<ClarificationSession[]>;
  findByCaseNumber(caseNumber: string): Promise<ClarificationSession[]>;
  findByStatus(status: string): Promise<ClarificationSession[]>;
  findExpired(): Promise<ClarificationSession[]>;
  findExpiringSoon(minutes: number): Promise<ClarificationSession[]>;
  
  // Session management
  markAsResponded(sessionId: string, responses: Record<string, any>): Promise<void>;
  markAsCompleted(sessionId: string): Promise<void>;
  markAsExpired(sessionId: string): Promise<void>;
  
  // Analytics
  getSessionMetrics(timeWindow?: { hours?: number }): Promise<{
    totalSessions: number;
    activeSessions: number;
    respondedSessions: number;
    completedSessions: number;
    expiredSessions: number;
    averageResponseTimeMinutes: number;
  }>;
}

export class PostgresClarificationSessionRepository implements ClarificationSessionRepository {
  /**
   * Create a new clarification session
   */
  async create(session: Omit<ClarificationSession, "id" | "createdAt" | "updatedAt">): Promise<ClarificationSession> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    const [newSession] = await db
      .insert(clarificationSessions)
      .values({
        ...session,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return newSession;
  }

  /**
   * Get clarification session by ID
   */
  async getById(id: string): Promise<ClarificationSession | null> {
    const db = getDb();
    if (!db) {
      return null;
    }
    const sessions = await db
      .select()
      .from(clarificationSessions)
      .where(eq(clarificationSessions.id, id))
      .limit(1);

    return sessions[0] || null;
  }

  /**
   * Get clarification session by session ID
   */
  async getBySessionId(sessionId: string): Promise<ClarificationSession | null> {
    const db = getDb();
    if (!db) {
      return null;
    }
    const sessions = await db
      .select()
      .from(clarificationSessions)
      .where(eq(clarificationSessions.sessionId, sessionId))
      .limit(1);

    return sessions[0] || null;
  }

  /**
   * Update clarification session
   */
  async update(id: string, updates: Partial<ClarificationSession>): Promise<ClarificationSession> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    const [updatedSession] = await db
      .update(clarificationSessions)
      .set(updates)
      .where(eq(clarificationSessions.id, id))
      .returning();

    if (!updatedSession) {
      throw new Error(`Clarification session not found: ${id}`);
    }

    return updatedSession;
  }

  /**
   * Delete clarification session
   */
  async delete(id: string): Promise<void> {
    const db = getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    await db
      .delete(clarificationSessions)
      .where(eq(clarificationSessions.id, id));
  }

  /**
   * Find active clarification sessions
   */
  async findActive(): Promise<ClarificationSession[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    return await db
      .select()
      .from(clarificationSessions)
      .where(eq(clarificationSessions.status, 'ACTIVE'))
      .orderBy(desc(clarificationSessions.createdAt));
  }

  /**
   * Find clarification sessions by case number
   */
  async findByCaseNumber(caseNumber: string): Promise<ClarificationSession[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    return await db
      .select()
      .from(clarificationSessions)
      .where(eq(clarificationSessions.caseNumber, caseNumber))
      .orderBy(desc(clarificationSessions.createdAt));
  }

  /**
   * Find clarification sessions by status
   */
  async findByStatus(status: string): Promise<ClarificationSession[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    return await db
      .select()
      .from(clarificationSessions)
      .where(eq(clarificationSessions.status, status))
      .orderBy(desc(clarificationSessions.createdAt));
  }

  /**
   * Find expired clarification sessions (ACTIVE sessions past their expiration time)
   */
  async findExpired(): Promise<ClarificationSession[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    const now = new Date();
    return await db
      .select()
      .from(clarificationSessions)
      .where(
        and(
          eq(clarificationSessions.status, 'ACTIVE'),
          lte(clarificationSessions.expiresAt, now)
        )
      )
      .orderBy(desc(clarificationSessions.expiresAt));
  }

  /**
   * Find sessions expiring soon
   */
  async findExpiringSoon(minutes: number = 30): Promise<ClarificationSession[]> {
    const db = getDb();
    if (!db) {
      return [];
    }
    const now = new Date();
    const cutoffTime = new Date(Date.now() + minutes * 60 * 1000);
    return await db
      .select()
      .from(clarificationSessions)
      .where(
        and(
          eq(clarificationSessions.status, 'ACTIVE'),
          gte(clarificationSessions.expiresAt, now),
          lte(clarificationSessions.expiresAt, cutoffTime)
        )
      )
      .orderBy(asc(clarificationSessions.expiresAt));
  }

  /**
   * Mark session as responded
   */
  async markAsResponded(id: string, responses: Record<string, any>): Promise<void> {
    await this.update(id, {
      responses,
      status: 'RESPONDED',
      respondedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Mark session as completed
   */
  async markAsCompleted(id: string): Promise<void> {
    await this.update(id, {
      status: 'RESOLVED',
      updatedAt: new Date(),
    });
  }

  /**
   * Mark session as expired
   */
  async markAsExpired(id: string): Promise<void> {
    await this.update(id, {
      status: 'EXPIRED',
      updatedAt: new Date(),
    });
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(timeWindow: { hours?: number } = { hours: 24 }): Promise<{
    totalSessions: number;
    activeSessions: number;
    respondedSessions: number;
    completedSessions: number;
    expiredSessions: number;
    averageResponseTimeMinutes: number;
  }> {
    const db = getDb();
    if (!db) {
      return {
        totalSessions: 0,
        activeSessions: 0,
        respondedSessions: 0,
        completedSessions: 0,
        expiredSessions: 0,
        averageResponseTimeMinutes: 0,
      };
    }

    const cutoffDate = new Date(Date.now() - (timeWindow.hours || 24) * 60 * 60 * 1000);

    const metrics = await db
      .select({
        totalSessions: count(clarificationSessions.id),
        activeSessions: sql<number>`count(case when ${clarificationSessions.status} = 'ACTIVE' then 1 end)`,
        respondedSessions: sql<number>`count(case when ${clarificationSessions.status} = 'RESPONDED' then 1 end)`,
        completedSessions: sql<number>`count(case when ${clarificationSessions.status} = 'RESOLVED' then 1 end)`,
        expiredSessions: sql<number>`count(case when ${clarificationSessions.status} = 'EXPIRED' then 1 end)`,
      })
      .from(clarificationSessions)
      .where(gte(clarificationSessions.createdAt, cutoffDate));

    const result = metrics[0] || {
      totalSessions: 0,
      activeSessions: 0,
      respondedSessions: 0,
      completedSessions: 0,
      expiredSessions: 0,
    };

    return {
      totalSessions: result.totalSessions,
      activeSessions: result.activeSessions,
      respondedSessions: result.respondedSessions,
      completedSessions: result.completedSessions,
      expiredSessions: result.expiredSessions,
      averageResponseTimeMinutes: 0, // TODO: Calculate from respondedAt - createdAt
    };
  }
}

/**
 * Get clarification session repository instance
 */
export function getClarificationSessionRepository(): ClarificationSessionRepository {
  return new PostgresClarificationSessionRepository();
}