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
import type { InterviewSessionState, StandupSessionState } from "../projects/types";
import { withWriteRetry, withQueryRetry } from "../db/retry-wrapper";
import type { SupervisorLlmReview } from "../supervisor/llm-reviewer";

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
 * Supervisor review payload
 */
export interface SupervisorReviewStatePayload {
  artifactType: "slack_message" | "servicenow_work_note";
  caseNumber?: string;
  channelId?: string;
  threadTs?: string;
  content: string;
  reason: string;
  metadata?: Record<string, any>;
  blockedAt: string;
  llmReview?: SupervisorLlmReview | null;
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
  project_standup: StandupSessionState;
  supervisor_review: SupervisorReviewStatePayload;
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

    try {
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

      const inserted = await withWriteRetry(async () => {
        const [result] = await db.insert(interactiveStates).values(newState).returning();
        return result;
      }, `save ${type} state for ${channelId}:${messageTs}`);

      console.log(`[Interactive State] Saved ${type} state for ${channelId}:${messageTs} (expires in ${expiresInHours}h)`);

      return inserted;
    } catch (error) {
      console.error(`[Interactive State] Error saving ${type} state:`, error);
      return null;
    }
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

    try {
      return await withQueryRetry(async () => {
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
      }, `get state for ${channelId}:${messageTs}`);
    } catch (error) {
      console.error(`[Interactive State] Error getting state:`, error);
      return null;
    }
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

    try {
      return await withQueryRetry(async () => {
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
      }, `get state by channel ${channelId}`);
    } catch (error) {
      console.error(`[Interactive State] Error getting state by channel:`, error);
      return null;
    }
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

    try {
      return await withQueryRetry(async () => {
        const results = await db
          .select()
          .from(interactiveStates)
          .where(eq(interactiveStates.id, id))
          .limit(1);

        if (results.length === 0) {
          return null;
        }

        return results[0] as InteractiveState & { payload: StatePayloadByType[T] };
      }, `get state by id ${id}`);
    } catch (error) {
      console.error(`[Interactive State] Error getting state by id:`, error);
      return null;
    }
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

    try {
      const result = await withWriteRetry(async () => {
        return await db
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
      }, `mark state as ${status} for ${channelId}:${messageTs}`);

      const updated = result.rowCount || 0;

      if (updated > 0) {
        console.log(`[Interactive State] Marked ${channelId}:${messageTs} as ${status} by ${processedBy}`);

        // Capture approved/completed interactive states as muscle memory (async, non-blocking)
        if (status === "approved" || status === "completed") {
          this.captureInteractiveStateExemplar(channelId, messageTs, status).catch((err) =>
            console.error("[MuscleMemory] Interactive state capture failed:", err)
          );
        }
      }

      return updated > 0;
    } catch (error) {
      console.error(`[Interactive State] Error marking state as processed:`, error);
      return false;
    }
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

    try {
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

      const result = await withWriteRetry(async () => {
        return await db
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
      }, `update payload for ${channelId}:${messageTs}`);

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`[Interactive State] Error updating payload:`, error);
      return false;
    }
  }

  /**
   * Delete state (for cleanup)
   */
  async deleteState(channelId: string, messageTs: string): Promise<boolean> {
    const db = getDb();
    if (!db) {
      return false;
    }

    try {
      const result = await withWriteRetry(async () => {
        return await db
          .delete(interactiveStates)
          .where(
            and(
              eq(interactiveStates.channelId, channelId),
              eq(interactiveStates.messageTs, messageTs)
            )
          );
      }, `delete state for ${channelId}:${messageTs}`);

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`[Interactive State] Error deleting state:`, error);
      return false;
    }
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

    try {
      const now = new Date();

      const result = await withWriteRetry(async () => {
        return await db
          .delete(interactiveStates)
          .where(lt(interactiveStates.expiresAt, now));
      }, 'cleanup expired states');

      const deleted = result.rowCount || 0;

      if (deleted > 0) {
        console.log(`[Interactive State] Cleaned up ${deleted} expired states`);
      }

      return deleted;
    } catch (error) {
      console.error(`[Interactive State] Error cleaning up expired states:`, error);
      return 0;
    }
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

    try {
      return await withQueryRetry(async () => {
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
      }, `get pending states by type ${type}`);
    } catch (error) {
      console.error(`[Interactive State] Error getting pending states by type:`, error);
      return [];
    }
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

    try {
      return await withQueryRetry(async () => {
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
      }, 'get state count');
    } catch (error) {
      console.error(`[Interactive State] Error getting state count:`, error);
      return 0;
    }
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

  /**
   * Capture approved/completed interactive state as muscle memory exemplar
   * Private helper method called after successful state approval/completion
   */
  private async captureInteractiveStateExemplar(
    channelId: string,
    messageTs: string,
    status: "approved" | "completed"
  ): Promise<void> {
    try {
      const { getConfigValue } = await import("../config");
      if (!getConfigValue("muscleMemoryCollectionEnabled")) {
        return;
      }

      // Get the full state to extract context
      const state = await this.getState(channelId, messageTs);
      if (!state) {
        return;
      }

      const { muscleMemoryService, qualityDetector } = await import("./muscle-memory");

      // Detect human feedback signal from state
      const humanSignal = qualityDetector.detectHumanFeedbackSignal(state);
      if (!humanSignal) {
        return; // No quality signal, skip capture
      }

      // Extract case number from payload if available
      const caseNumber = (state.payload as any)?.caseNumber || "UNKNOWN";

      // Map state type to interaction type, default to "generic" for unknown types
      const interactionType = (state.type === "supervisor_review" ? "triage" : "generic") as any;

      // Capture the interaction
      await muscleMemoryService.captureExemplar({
        caseNumber,
        interactionType,
        inputContext: {
          userRequest: `Interactive state: ${state.type}`,
        },
        actionTaken: {
          agentType: "interactive_workflow",
          workNotes: [`${state.type} ${status}`, JSON.stringify(state.payload).substring(0, 200)],
        },
        outcome: status === "approved" || status === "completed" ? "success" : "user_corrected",
        qualitySignals: [humanSignal],
      });

      console.log(`[MuscleMemory] Captured ${state.type} ${status} for ${caseNumber}`);
    } catch (error) {
      console.error("[MuscleMemory] Failed to capture interactive state:", error);
    }
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
