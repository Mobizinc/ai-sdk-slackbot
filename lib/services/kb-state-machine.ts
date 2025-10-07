/**
 * KB State Machine for tracking multi-stage KB generation workflow.
 * Manages states, transitions, and timeout cleanup for quality-aware KB generation.
 * Persists to database when available.
 */

import type { KBStateRepository } from "../db/repositories/kb-state-repository";
import { getKBStateRepository } from "../db/repositories/kb-state-repository";

export enum KBState {
  ASSESSING = "assessing",           // Running quality check
  GATHERING = "gathering",           // Waiting for user input
  GENERATING = "generating",         // Creating article
  PENDING_APPROVAL = "pending_approval", // Posted, waiting for ✅/❌
  APPROVED = "approved",             // User approved
  REJECTED = "rejected",             // User rejected
  AWAITING_NOTES = "awaiting_notes", // Waiting for ServiceNow case notes to be updated
  ABANDONED = "abandoned",           // Timeout or insufficient quality
}

export interface KBGenerationContext {
  caseNumber: string;
  threadTs: string;
  channelId: string;
  state: KBState;
  startedAt: Date;
  lastUpdated: Date;
  attemptCount: number; // Number of times we've asked for input
  userResponses: string[]; // Collected responses from user
  assessmentScore?: number;
  missingInfo?: string[];
}

export class KBStateMachine {
  private contexts = new Map<string, KBGenerationContext>();
  private readonly maxAttempts = 5; // Allow up to 5 clarification attempts before abandoning
  private readonly timeoutHours = 24;
  private repository: KBStateRepository;

  constructor(repository?: KBStateRepository) {
    this.repository = repository || getKBStateRepository();
  }

  /**
   * Initialize KB generation for a case
   */
  initialize(caseNumber: string, threadTs: string, channelId: string): void {
    const key = this.getKey(caseNumber, threadTs);

    const context: KBGenerationContext = {
      caseNumber,
      threadTs,
      channelId,
      state: KBState.ASSESSING,
      startedAt: new Date(),
      lastUpdated: new Date(),
      attemptCount: 0,
      userResponses: [],
    };

    this.contexts.set(key, context);

    // Persist to database
    this.repository.saveState(context).catch((err) => {
      console.error("[KB State] Failed to save initial state:", err);
    });

    console.log(`[KB State] Initialized for ${caseNumber} in state ASSESSING`);
  }

  /**
   * Transition to a new state
   */
  setState(caseNumber: string, threadTs: string, newState: KBState): void {
    const key = this.getKey(caseNumber, threadTs);
    const context = this.contexts.get(key);

    if (!context) {
      console.warn(`[KB State] No context found for ${caseNumber}, creating new one`);
      this.initialize(caseNumber, threadTs, "");
      return;
    }

    const oldState = context.state;
    context.state = newState;
    context.lastUpdated = new Date();

    // Persist to database
    this.repository.saveState(context).catch((err) => {
      console.error("[KB State] Failed to save state update:", err);
    });

    console.log(`[KB State] ${caseNumber}: ${oldState} → ${newState}`);
  }

  /**
   * Get current state
   */
  getState(caseNumber: string, threadTs: string): KBState | null {
    const key = this.getKey(caseNumber, threadTs);
    return this.contexts.get(key)?.state || null;
  }

  /**
   * Get full context
   */
  getContext(caseNumber: string, threadTs: string): KBGenerationContext | null {
    const key = this.getKey(caseNumber, threadTs);
    return this.contexts.get(key) || null;
  }

  /**
   * Check if waiting for user input
   */
  isWaitingForUser(caseNumber: string, threadTs: string): boolean {
    const state = this.getState(caseNumber, threadTs);
    return state === KBState.GATHERING;
  }

  /**
   * Add user response during GATHERING
   */
  addUserResponse(caseNumber: string, threadTs: string, response: string): void {
    const key = this.getKey(caseNumber, threadTs);
    const context = this.contexts.get(key);

    if (!context) {
      console.warn(`[KB State] Cannot add response, no context for ${caseNumber}`);
      return;
    }

    context.userResponses.push(response);
    context.lastUpdated = new Date();

    // Persist to database
    this.repository.saveState(context).catch((err) => {
      console.error("[KB State] Failed to save user response:", err);
    });

    console.log(`[KB State] Added user response for ${caseNumber} (${context.userResponses.length} total)`);
  }

  /**
   * Increment attempt counter
   */
  incrementAttempt(caseNumber: string, threadTs: string): number {
    const key = this.getKey(caseNumber, threadTs);
    const context = this.contexts.get(key);

    if (!context) {
      console.warn(`[KB State] Cannot increment attempt, no context for ${caseNumber}`);
      return 0;
    }

    context.attemptCount += 1;
    context.lastUpdated = new Date();

    // Persist to database
    this.repository.saveState(context).catch((err) => {
      console.error("[KB State] Failed to save attempt count:", err);
    });

    console.log(`[KB State] Attempt ${context.attemptCount}/${this.maxAttempts} for ${caseNumber}`);

    return context.attemptCount;
  }

  /**
   * Check if max attempts reached
   */
  hasReachedMaxAttempts(caseNumber: string, threadTs: string): boolean {
    const context = this.getContext(caseNumber, threadTs);
    return (context?.attemptCount || 0) >= this.maxAttempts;
  }

  /**
   * Store assessment results
   */
  storeAssessment(
    caseNumber: string,
    threadTs: string,
    score: number,
    missingInfo: string[]
  ): void {
    const key = this.getKey(caseNumber, threadTs);
    const context = this.contexts.get(key);

    if (context) {
      context.assessmentScore = score;
      context.missingInfo = missingInfo;
      context.lastUpdated = new Date();

      // Persist to database
      this.repository.saveState(context).catch((err) => {
        console.error("[KB State] Failed to save assessment:", err);
      });
    }
  }

  /**
   * Remove context (cleanup after completion or abandonment)
   */
  remove(caseNumber: string, threadTs: string): void {
    const key = this.getKey(caseNumber, threadTs);
    this.contexts.delete(key);

    // Delete from database
    this.repository.deleteState(caseNumber, threadTs).catch((err) => {
      console.error("[KB State] Failed to delete state from database:", err);
    });

    console.log(`[KB State] Removed context for ${caseNumber}`);
  }

  /**
   * Load all active states from database on startup
   */
  async loadFromDatabase(): Promise<void> {
    try {
      console.log("[KB State] Loading states from database...");
      const states = await this.repository.loadAllActiveStates();

      for (const state of states) {
        const key = this.getKey(state.caseNumber, state.threadTs);
        this.contexts.set(key, state);
      }

      console.log(`[KB State] Loaded ${states.length} states from database`);
    } catch (error) {
      console.error("[KB State] Error loading states from database:", error);
      // Continue without database states
    }
  }

  /**
   * Clean up expired contexts (timeout handling)
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const cutoffTime = now.getTime() - this.timeoutHours * 60 * 60 * 1000;
    let removed = 0;

    // Clean up memory
    for (const [key, context] of this.contexts.entries()) {
      // Only cleanup GATHERING state contexts that have timed out
      if (
        context.state === KBState.GATHERING &&
        context.lastUpdated.getTime() < cutoffTime
      ) {
        console.log(`[KB State] Cleaning up expired context for ${context.caseNumber}`);
        this.contexts.delete(key);
        removed++;
      }
    }

    // Clean up database
    try {
      const dbRemoved = await this.repository.cleanupExpiredStates(this.timeoutHours);
      console.log(`[KB State] Cleaned up ${removed} from memory, ${dbRemoved} from database`);
    } catch (error) {
      console.error("[KB State] Error cleaning up database:", error);
    }

    if (removed > 0) {
      console.log(`[KB State] Cleaned up ${removed} expired contexts from memory`);
    }

    return removed;
  }

  /**
   * Get all contexts in a specific state
   */
  getContextsInState(state: KBState): KBGenerationContext[] {
    return Array.from(this.contexts.values()).filter(ctx => ctx.state === state);
  }

  /**
   * Get statistics
   */
  getStats() {
    const states = Array.from(this.contexts.values());
    return {
      total: states.length,
      assessing: states.filter(s => s.state === KBState.ASSESSING).length,
      gathering: states.filter(s => s.state === KBState.GATHERING).length,
      generating: states.filter(s => s.state === KBState.GENERATING).length,
      pendingApproval: states.filter(s => s.state === KBState.PENDING_APPROVAL).length,
    };
  }

  private getKey(caseNumber: string, threadTs: string): string {
    return `${caseNumber}:${threadTs}`;
  }
}

// Global singleton
let stateMachine: KBStateMachine | null = null;

export function getKBStateMachine(): KBStateMachine {
  if (!stateMachine) {
    stateMachine = new KBStateMachine();

    // Run cleanup every hour
    setInterval(() => {
      stateMachine?.cleanupExpired();
    }, 60 * 60 * 1000);
  }

  return stateMachine;
}
