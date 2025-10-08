/**
 * Case Context Repository
 * Handles persistence of case conversations and messages
 */

import { eq, and, lt, gte, desc } from "drizzle-orm";
import { getDb } from "../client";
import { caseContexts, caseMessages } from "../schema";
import type { CaseContext as ContextManagerContext, CaseMessage } from "../../context-manager";

export class CaseContextRepository {
  /**
   * Save or update a case context
   */
  async saveContext(context: ContextManagerContext): Promise<void> {
    const db = getDb();
    if (!db) {
      // DB not available, skip persistence
      return;
    }

    try {
      await db
        .insert(caseContexts)
        .values({
          caseNumber: context.caseNumber,
          threadTs: context.threadTs,
          channelId: context.channelId,
          channelName: context.channelName,
          isResolved: context.isResolved || false,
          resolvedAt: context.resolvedAt,
          detectedAt: context.detectedAt,
          lastUpdated: context.lastUpdated,
          notified: context._notified || false,
        })
        .onConflictDoUpdate({
          target: [caseContexts.caseNumber, caseContexts.threadTs],
          set: {
            channelName: context.channelName,
            isResolved: context.isResolved || false,
            resolvedAt: context.resolvedAt,
            lastUpdated: context.lastUpdated,
            notified: context._notified || false,
          },
        });

      console.log(`[DB] Saved context for ${context.caseNumber}`);
    } catch (error) {
      console.error(`[DB] Error saving context for ${context.caseNumber}:`, error);
    }
  }

  /**
   * Save a message to the database
   */
  async saveMessage(
    caseNumber: string,
    threadTs: string,
    message: CaseMessage
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db.insert(caseMessages).values({
        caseNumber,
        threadTs,
        userId: message.user,
        messageText: message.text,
        messageTimestamp: message.timestamp,
      });

      console.log(`[DB] Saved message for ${caseNumber}`);
    } catch (error) {
      console.error(`[DB] Error saving message for ${caseNumber}:`, error);
    }
  }

  /**
   * Load a case context with all its messages
   */
  async loadContext(
    caseNumber: string,
    threadTs: string
  ): Promise<ContextManagerContext | undefined> {
    const db = getDb();
    if (!db) return undefined;

    try {
      // Load context
      const contextResult = await db
        .select()
        .from(caseContexts)
        .where(
          and(
            eq(caseContexts.caseNumber, caseNumber),
            eq(caseContexts.threadTs, threadTs)
          )
        )
        .limit(1);

      if (contextResult.length === 0) {
        return undefined;
      }

      const dbContext = contextResult[0];

      // Load messages
      const messagesResult = await db
        .select()
        .from(caseMessages)
        .where(
          and(
            eq(caseMessages.caseNumber, caseNumber),
            eq(caseMessages.threadTs, threadTs)
          )
        )
        .orderBy(caseMessages.messageTimestamp);

      // Convert to ContextManager format
      const messages: CaseMessage[] = messagesResult.map((msg) => ({
        user: msg.userId,
        text: msg.messageText,
        timestamp: msg.messageTimestamp,
        thread_ts: threadTs,
      }));

      const context: ContextManagerContext = {
        caseNumber: dbContext.caseNumber,
        threadTs: dbContext.threadTs,
        channelId: dbContext.channelId,
        channelName: dbContext.channelName || undefined,
        messages,
        detectedAt: dbContext.detectedAt,
        lastUpdated: dbContext.lastUpdated,
        isResolved: dbContext.isResolved,
        resolvedAt: dbContext.resolvedAt || undefined,
        _notified: dbContext.notified,
      };

      console.log(`[DB] Loaded context for ${caseNumber} with ${messages.length} messages`);
      return context;
    } catch (error) {
      console.error(`[DB] Error loading context for ${caseNumber}:`, error);
      return undefined;
    }
  }

  /**
   * Load all active contexts (updated within last 72 hours)
   */
  async loadAllActiveContexts(maxAgeHours: number = 72): Promise<ContextManagerContext[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      const contextsResult = await db
        .select()
        .from(caseContexts)
        .where(gte(caseContexts.lastUpdated, cutoffTime))
        .orderBy(desc(caseContexts.lastUpdated));

      console.log(`[DB] Loading ${contextsResult.length} active contexts`);

      const contexts: ContextManagerContext[] = [];

      for (const dbContext of contextsResult) {
        // Load messages for this context
        const messagesResult = await db
          .select()
          .from(caseMessages)
          .where(
            and(
              eq(caseMessages.caseNumber, dbContext.caseNumber),
              eq(caseMessages.threadTs, dbContext.threadTs)
            )
          )
          .orderBy(caseMessages.messageTimestamp);

        const messages: CaseMessage[] = messagesResult.map((msg) => ({
          user: msg.userId,
          text: msg.messageText,
          timestamp: msg.messageTimestamp,
          thread_ts: dbContext.threadTs,
        }));

        contexts.push({
          caseNumber: dbContext.caseNumber,
          threadTs: dbContext.threadTs,
          channelId: dbContext.channelId,
          channelName: dbContext.channelName || undefined,
          messages,
          detectedAt: dbContext.detectedAt,
          lastUpdated: dbContext.lastUpdated,
          isResolved: dbContext.isResolved,
          resolvedAt: dbContext.resolvedAt || undefined,
          _notified: dbContext.notified,
        });
      }

      console.log(`[DB] Loaded ${contexts.length} active contexts from database`);
      return contexts;
    } catch (error) {
      console.error("[DB] Error loading active contexts:", error);
      return [];
    }
  }

  /**
   * Load all contexts for a specific case number (across threads)
   */
  async loadContextsForCase(caseNumber: string): Promise<ContextManagerContext[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const contextsResult = await db
        .select()
        .from(caseContexts)
        .where(eq(caseContexts.caseNumber, caseNumber))
        .orderBy(desc(caseContexts.lastUpdated));

      const contexts: ContextManagerContext[] = [];

      for (const dbContext of contextsResult) {
        const messagesResult = await db
          .select()
          .from(caseMessages)
          .where(
            and(
              eq(caseMessages.caseNumber, dbContext.caseNumber),
              eq(caseMessages.threadTs, dbContext.threadTs)
            )
          )
          .orderBy(caseMessages.messageTimestamp);

        const messages: CaseMessage[] = messagesResult.map((msg) => ({
          user: msg.userId,
          text: msg.messageText,
          timestamp: msg.messageTimestamp,
          thread_ts: dbContext.threadTs,
        }));

        contexts.push({
          caseNumber: dbContext.caseNumber,
          threadTs: dbContext.threadTs,
          channelId: dbContext.channelId,
          channelName: dbContext.channelName || undefined,
          messages,
          detectedAt: dbContext.detectedAt,
          lastUpdated: dbContext.lastUpdated,
          isResolved: dbContext.isResolved,
          resolvedAt: dbContext.resolvedAt || undefined,
          _notified: dbContext.notified,
        });
      }

      console.log(`[DB] Loaded ${contexts.length} contexts for case ${caseNumber}`);
      return contexts;
    } catch (error) {
      console.error(`[DB] Error loading contexts for case ${caseNumber}:`, error);
      return [];
    }
  }

  /**
   * Mark a context as notified
   */
  async markAsNotified(caseNumber: string, threadTs: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(caseContexts)
        .set({ notified: true })
        .where(
          and(
            eq(caseContexts.caseNumber, caseNumber),
            eq(caseContexts.threadTs, threadTs)
          )
        );

      console.log(`[DB] Marked ${caseNumber} as notified`);
    } catch (error) {
      console.error(`[DB] Error marking ${caseNumber} as notified:`, error);
    }
  }

  /**
   * Delete old contexts and their messages
   */
  async deleteOldContexts(maxAgeHours: number): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      // First, find all old contexts
      const oldContexts = await db
        .select({ caseNumber: caseContexts.caseNumber, threadTs: caseContexts.threadTs })
        .from(caseContexts)
        .where(lt(caseContexts.lastUpdated, cutoffTime));

      if (oldContexts.length === 0) {
        return 0;
      }

      // Delete messages for each old context
      for (const context of oldContexts) {
        await db
          .delete(caseMessages)
          .where(
            and(
              eq(caseMessages.caseNumber, context.caseNumber),
              eq(caseMessages.threadTs, context.threadTs)
            )
          );
      }

      // Delete the contexts
      const result = await db
        .delete(caseContexts)
        .where(lt(caseContexts.lastUpdated, cutoffTime));

      const count = result.rowCount || 0;
      console.log(`[DB] Deleted ${count} old contexts`);
      return count;
    } catch (error) {
      console.error("[DB] Error deleting old contexts:", error);
      return 0;
    }
  }
}

// Singleton instance
let repository: CaseContextRepository | null = null;

export function getCaseContextRepository(): CaseContextRepository {
  if (!repository) {
    repository = new CaseContextRepository();
  }
  return repository;
}
