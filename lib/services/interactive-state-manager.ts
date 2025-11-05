/**
 * Interactive State Manager
 * Provides persistence layer for Slack interactive components
 *
 * Features:
 * - Survives app restarts
 * - Audit trail for all interactive actions
 * - Automatic expiration and cleanup
 * - Type-safe state storage
 *
 * Supported state types:
 * - kb_approval: KB article approval workflows
 * - context_update: Business context update proposals
 * - modal_wizard: Multi-step modal workflows
 */

import { getDb } from "../db/client";
import { interactiveStates, type InteractiveState, type NewInteractiveState } from "../db/schema";
import { eq, and, lt, desc, gt } from "drizzle-orm";
import type { InterviewSessionState } from "../projects/types";

/**
 * KB Approval State Payload
 */
export interface KBApprovalStatePayload {
  caseNumber: string;
  article: {
    title: string;
    problem: string;
    solution: string;
    environment: string;
    rootCause?: string;
    tags: string[];
  };
}

/**
 * Context Update State Payload
 */
export interface ContextUpdateStatePayload {
  entityName: string;
  proposedChanges: Record<string, any>;
  proposedBy: string;
  sourceChannelId: string;
  sourceThreadTs?: string;
}

/**
 * Modal Wizard State Payload
 */
export interface ModalWizardStatePayload {
  wizardId: string;
  currentStep: number;
  totalSteps: number;
  collectedData: Record<string, any>;
}

/**
 * Stale Ticket Workflow State Payload
 */
export interface StaleTicketWorkflowStatePayload {
  channelId: string;
  messageTs: string;
  thresholdDays: number;
  filters?: Record<string, any>;
  staleCases: Array<{
    case: any; // Case object
    staleDays: number;
    ageDays: number;
    isHighPriority: boolean;
  }>;
}

/**
 * Case Search State Payload (for pagination)
 */
export interface CaseSearchStatePayload {
  filters: Record<string, any>;
  currentOffset: number;
  totalResults: number;
  userId: string;
}

/**
 * Type-safe state payloads by type
 */
export type StatePayloadByType = {
  kb_approval: KBApprovalStatePayload;
  context_update: ContextUpdateStatePayload;
  modal_wizard: ModalWizardStatePayload;
  stale_ticket_workflow: StaleTicketWorkflowStatePayload;
  case_search: CaseSearchStatePayload;
  project_interview: InterviewSessionState;
};

/**
 * Interactive State Manager Service
 */
export class InteractiveStateManager {
  /**
   * Save a new interactive state
   */
  async saveState<T extends keyof StatePayloadByType>(
    type: T,
    channelId: string,
    messageTs: string,
    payload: StatePayloadByType[T],
    options?: {
      threadTs?: string;
      expiresInHours?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<InteractiveState | null> {
    const db = getDb();
    if (!db) {
      console.warn('[Interactive State] Database not available, state will not persist');
      return null;
    }

    const expiresInHours = options?.expiresInHours || 24; // Default 24 hours
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const newState: NewInteractiveState = {
      type,
      channelId,
      messageTs,
      threadTs: options?.threadTs,
      payload: payload as Record<string, any>,
      status: "pending",
      expiresAt,
      metadata: options?.metadata || {},
    };

    const [inserted] = await db.insert(interactiveStates).values(newState).returning();

    console.log(`[Interactive State] Saved ${type} state for ${channelId}:${messageTs} (expires in ${expiresInHours}h)`);

    return inserted;
  }

  /**
   * Get state by channel and message timestamp
   */
  async getState<T extends keyof StatePayloadByType>(
    channelId: string,
    messageTs: string,
    type?: T
  ): Promise<(InteractiveState & { payload: StatePayloadByType[T] }) | null> {
    const db = getDb();
    if (!db) {
      return null;
    }

    const conditions = [
      eq(interactiveStates.channelId, channelId),
      eq(interactiveStates.messageTs, messageTs),
      eq(interactiveStates.status, "pending"),
      gt(interactiveStates.expiresAt, new Date()), // Not expired (gt = greater than, not lt)
    ];

    if (type) {
      conditions.push(eq(interactiveStates.type, type));
    }

    const results = await db
      .select()
      .from(interactiveStates)
      .where(and(...conditions))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return results[0] as InteractiveState & { payload: StatePayloadByType[T] };
  }

  /**
   * Get the most recent pending state for a channel (useful for DM flows)
   */
  async getStateByChannel<T extends keyof StatePayloadByType>(
    channelId: string,
    type: T
  ): Promise<(InteractiveState & { payload: StatePayloadByType[T] }) | null> {
    const db = getDb();
    if (!db) {
      return null;
    }

    const results = await db
      .select()
      .from(interactiveStates)
      .where(
        and(
          eq(interactiveStates.channelId, channelId),
          eq(interactiveStates.type, type),
          eq(interactiveStates.status, "pending"),
          gt(interactiveStates.expiresAt, new Date())
        )
      )
      .orderBy(desc(interactiveStates.createdAt))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return results[0] as InteractiveState & { payload: StatePayloadByType[T] };
  }

  /**
   * Get state by ID
   */
  async getStateById<T extends keyof StatePayloadByType>(
    id: string
  ): Promise<(InteractiveState & { payload: StatePayloadByType[T] }) | null> {
    const db = getDb();
    if (!db) {
      return null;
    }

    const results = await db
      .select()
      .from(interactiveStates)
      .where(eq(interactiveStates.id, id))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return results[0] as InteractiveState & { payload: StatePayloadByType[T] };
  }

  /**
   * Mark state as processed (approved, rejected, completed)
   */
  async markProcessed(
    channelId: string,
    messageTs: string,
    processedBy: string,
    status: "approved" | "rejected" | "completed",
    errorMessage?: string
  ): Promise<boolean> {
    const db = getDb();
    if (!db) {
      return false;
    }

    const result = await db
      .update(interactiveStates)
      .set({
        status,
        processedBy,
        processedAt: new Date(),
        errorMessage,
      })
      .where(
        and(
          eq(interactiveStates.channelId, channelId),
          eq(interactiveStates.messageTs, messageTs),
          eq(interactiveStates.status, "pending")
        )
      );

    const updated = result.rowCount || 0;

    if (updated > 0) {
      console.log(`[Interactive State] Marked ${channelId}:${messageTs} as ${status} by ${processedBy}`);
    }

    return updated > 0;
  }

  /**
   * Update state payload (for multi-step workflows)
   */
  async updatePayload<T extends keyof StatePayloadByType>(
    channelId: string,
    messageTs: string,
    payload: Partial<StatePayloadByType[T]>
  ): Promise<boolean> {
    const db = getDb();
    if (!db) {
      return false;
    }

    // Get current state
    const current = await this.getState(channelId, messageTs);

    if (!current) {
      return false;
    }

    // Merge with existing payload
    const updatedPayload = {
      ...current.payload,
      ...payload,
    };

    const result = await db
      .update(interactiveStates)
      .set({
        payload: updatedPayload as Record<string, any>,
      })
      .where(
        and(
          eq(interactiveStates.channelId, channelId),
          eq(interactiveStates.messageTs, messageTs)
        )
      );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Delete state (for cleanup)
   */
  async deleteState(channelId: string, messageTs: string): Promise<boolean> {
    const db = getDb();
    if (!db) {
      return false;
    }

    const result = await db
      .delete(interactiveStates)
      .where(
        and(
          eq(interactiveStates.channelId, channelId),
          eq(interactiveStates.messageTs, messageTs)
        )
      );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Cleanup expired states
   * Returns count of deleted states
   */
  async cleanupExpiredStates(): Promise<number> {
    const db = getDb();
    if (!db) {
      return 0;
    }

    const now = new Date();

    const result = await db
      .delete(interactiveStates)
      .where(lt(interactiveStates.expiresAt, now));

    const deleted = result.rowCount || 0;

    if (deleted > 0) {
      console.log(`[Interactive State] Cleaned up ${deleted} expired states`);
    }

    return deleted;
  }

  /**
   * Get all pending states by type
   */
  async getPendingStatesByType<T extends keyof StatePayloadByType>(
    type: T
  ): Promise<Array<InteractiveState & { payload: StatePayloadByType[T] }>> {
    const db = getDb();
    if (!db) {
      return [];
    }

    const results = await db
      .select()
      .from(interactiveStates)
      .where(
        and(
          eq(interactiveStates.type, type),
          eq(interactiveStates.status, "pending"),
          gt(interactiveStates.expiresAt, new Date()) // Not expired (gt = greater than)
        )
      )
      .orderBy(desc(interactiveStates.createdAt));

    return results as Array<InteractiveState & { payload: StatePayloadByType[T] }>;
  }

  /**
   * Get state count by type and status
   */
  async getStateCount(
    type?: string,
    status?: string
  ): Promise<number> {
    const db = getDb();
    if (!db) {
      return 0;
    }

    const conditions = [];

    if (type) {
      conditions.push(eq(interactiveStates.type, type));
    }

    if (status) {
      conditions.push(eq(interactiveStates.status, status));
    }

    const results = await db
      .select()
      .from(interactiveStates)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return results.length;
  }

  /**
   * Start automatic cleanup job (runs every hour)
   */
  startCleanupJob(): void {
    // Run cleanup immediately
    this.cleanupExpiredStates().catch((error) => {
      console.error("[Interactive State] Initial cleanup failed:", error);
    });

    // Schedule cleanup every hour
    setInterval(() => {
      this.cleanupExpiredStates().catch((error) => {
        console.error("[Interactive State] Cleanup job failed:", error);
      });
    }, 60 * 60 * 1000); // Every hour

    console.log("[Interactive State] Cleanup job started (runs every hour)");
  }
}

// Global singleton instance
let interactiveStateManager: InteractiveStateManager | null = null;

/**
 * Get singleton instance of Interactive State Manager
 */
export function getInteractiveStateManager(): InteractiveStateManager {
  if (!interactiveStateManager) {
    interactiveStateManager = new InteractiveStateManager();
    // Start cleanup job
    interactiveStateManager.startCleanupJob();
  }

  return interactiveStateManager;
}
