/**
 * KB State Repository
 * Handles persistence of KB generation workflow states
 */

import { eq, and, lt, ne } from "drizzle-orm";
import { getDb } from "../client";
import { kbGenerationStates } from "../schema";
import type { KBGenerationContext } from "../../services/kb-state-machine";
import { withWriteRetry, withQueryRetry } from "../retry-wrapper";

export class KBStateRepository {
  /**
   * Save or update a KB generation state
   */
  async saveState(state: KBGenerationContext): Promise<void> {
    const db = getDb();
    if (!db) {
      // DB not available, skip persistence
      return;
    }

    try {
      await withWriteRetry(async () => {
        await db
          .insert(kbGenerationStates)
          .values({
            caseNumber: state.caseNumber,
            threadTs: state.threadTs,
            channelId: state.channelId,
            state: state.state,
            attemptCount: state.attemptCount,
            userResponses: state.userResponses,
            assessmentScore: state.assessmentScore,
            missingInfo: state.missingInfo || [],
            startedAt: state.startedAt,
            lastUpdated: state.lastUpdated,
          })
          .onConflictDoUpdate({
            target: [kbGenerationStates.caseNumber, kbGenerationStates.threadTs],
            set: {
              channelId: state.channelId,
              state: state.state,
              attemptCount: state.attemptCount,
              userResponses: state.userResponses,
              assessmentScore: state.assessmentScore,
              missingInfo: state.missingInfo || [],
              lastUpdated: state.lastUpdated,
            },
          });
      }, `save KB state for ${state.caseNumber}`);

      console.log(`[DB] Saved KB state for ${state.caseNumber}: ${state.state}`);
    } catch (error) {
      console.error(`[DB] Error saving KB state for ${state.caseNumber}:`, error);
    }
  }

  /**
   * Load a single KB generation state
   */
  async loadState(
    caseNumber: string,
    threadTs: string
  ): Promise<KBGenerationContext | null> {
    const db = getDb();
    if (!db) return null;

    try {
      return await withQueryRetry(async () => {
        const result = await db
          .select()
          .from(kbGenerationStates)
          .where(
            and(
              eq(kbGenerationStates.caseNumber, caseNumber),
              eq(kbGenerationStates.threadTs, threadTs)
            )
          )
          .limit(1);

        if (result.length === 0) {
          return null;
        }

        const dbState = result[0];

        const state: KBGenerationContext = {
          caseNumber: dbState.caseNumber,
          threadTs: dbState.threadTs,
          channelId: dbState.channelId,
          state: dbState.state as any, // Cast to KBState enum
          attemptCount: dbState.attemptCount,
          userResponses: dbState.userResponses as string[],
          assessmentScore: dbState.assessmentScore || undefined,
          missingInfo: (dbState.missingInfo as string[]) || undefined,
          startedAt: dbState.startedAt,
          lastUpdated: dbState.lastUpdated,
        };

        console.log(`[DB] Loaded KB state for ${caseNumber}: ${state.state}`);
        return state;
      }, `load KB state for ${caseNumber}`);
    } catch (error) {
      console.error(`[DB] Error loading KB state for ${caseNumber}:`, error);
      return null;
    }
  }

  /**
   * Load all active gathering states (for resuming after restart)
   */
  async loadActiveGatheringStates(): Promise<KBGenerationContext[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await withQueryRetry(async () => {
        const result = await db
          .select()
          .from(kbGenerationStates)
          .where(eq(kbGenerationStates.state, "gathering"));

        const states: KBGenerationContext[] = result.map((dbState) => ({
          caseNumber: dbState.caseNumber,
          threadTs: dbState.threadTs,
          channelId: dbState.channelId,
          state: dbState.state as any,
          attemptCount: dbState.attemptCount,
          userResponses: dbState.userResponses as string[],
          assessmentScore: dbState.assessmentScore || undefined,
          missingInfo: (dbState.missingInfo as string[]) || undefined,
          startedAt: dbState.startedAt,
          lastUpdated: dbState.lastUpdated,
        }));

        console.log(`[DB] Loaded ${states.length} active gathering states`);
        return states;
      }, 'load active gathering states');
    } catch (error) {
      console.error("[DB] Error loading active gathering states:", error);
      return [];
    }
  }

  /**
   * Load all active states (not ABANDONED/APPROVED/REJECTED)
   */
  async loadAllActiveStates(): Promise<KBGenerationContext[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await withQueryRetry(async () => {
        const result = await db
          .select()
          .from(kbGenerationStates)
          .where(
            and(
              ne(kbGenerationStates.state, "abandoned"),
              ne(kbGenerationStates.state, "approved"),
              ne(kbGenerationStates.state, "rejected")
            )
          );

        const states: KBGenerationContext[] = result.map((dbState) => ({
          caseNumber: dbState.caseNumber,
          threadTs: dbState.threadTs,
          channelId: dbState.channelId,
          state: dbState.state as any,
          attemptCount: dbState.attemptCount,
          userResponses: dbState.userResponses as string[],
          assessmentScore: dbState.assessmentScore || undefined,
          missingInfo: (dbState.missingInfo as string[]) || undefined,
          startedAt: dbState.startedAt,
          lastUpdated: dbState.lastUpdated,
        }));

        console.log(`[DB] Loaded ${states.length} active KB generation states`);
        return states;
      }, 'load all active KB states');
    } catch (error) {
      console.error("[DB] Error loading active states:", error);
      return [];
    }
  }

  /**
   * Delete a KB generation state
   */
  async deleteState(caseNumber: string, threadTs: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .delete(kbGenerationStates)
        .where(
          and(
            eq(kbGenerationStates.caseNumber, caseNumber),
            eq(kbGenerationStates.threadTs, threadTs)
          )
        );

      console.log(`[DB] Deleted KB state for ${caseNumber}`);
    } catch (error) {
      console.error(`[DB] Error deleting KB state for ${caseNumber}:`, error);
    }
  }

  /**
   * Clean up expired gathering states (timeout handling)
   */
  async cleanupExpiredStates(timeoutHours: number): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - timeoutHours);

      const result = await db
        .delete(kbGenerationStates)
        .where(
          and(
            eq(kbGenerationStates.state, "gathering"),
            lt(kbGenerationStates.lastUpdated, cutoffTime)
          )
        );

      const count = result.rowCount || 0;
      console.log(`[DB] Cleaned up ${count} expired KB states`);
      return count;
    } catch (error) {
      console.error("[DB] Error cleaning up expired states:", error);
      return 0;
    }
  }
}

// Singleton instance
let repository: KBStateRepository | null = null;

export function getKBStateRepository(): KBStateRepository {
  if (!repository) {
    repository = new KBStateRepository();
  }
  return repository;
}
