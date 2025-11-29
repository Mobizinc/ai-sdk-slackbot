/**
 * @file lib/services/workflow-manager.ts
 * @description A centralized service for managing the lifecycle of stateful, multi-step workflows.
 *
 * This service provides a unified interface for creating, transitioning, and querying
 * stateful processes, which are persisted in the `workflows` table. It is designed to
 * replace disparate state management systems (like the InteractiveStateManager for specific tasks)
 * with a single, robust, and observable orchestration layer.
 */

import { and, eq, lt, not, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { workflows, NewWorkflow, Workflow } from "../db/schema";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";

// Re-export types for consumers
export type { Workflow, NewWorkflow };

// Define simple error classes for clear and specific error handling.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

interface StartWorkflowParams {
  workflowType: string;
  workflowReferenceId: string;
  initialState: string;
  payload: Record<string, any>;
  contextKey?: string;
  correlationId?: string;
  expiresInSeconds?: number;
}

interface TransitionWorkflowParams {
  toState: string;
  reason?: string;
  updatePayload?: Record<string, any>;
  lastModifiedBy?: string;
}

export class WorkflowManager {
  private db: NeonHttpDatabase<typeof schema>;

  constructor() {
    const dbInstance = getDb();
    if (!dbInstance) {
      throw new Error("Database is not available. WorkflowManager cannot be initialized.");
    }
    this.db = dbInstance;
  }

  /**
   * Starts a new workflow instance and persists it to the database.
   * Ensures that no other active workflow of the same type and reference ID exists.
   * @param params - The parameters to initialize the workflow.
   * @returns The newly created workflow object.
   */
  public async start(params: StartWorkflowParams): Promise<Workflow> {
    const {
      workflowType,
      workflowReferenceId,
      initialState,
      payload,
      contextKey,
      correlationId,
      expiresInSeconds,
    } = params;

    const newWorkflow: NewWorkflow = {
      workflowType,
      workflowReferenceId,
      currentState: initialState,
      payload,
      contextKey,
      correlationId,
    };

    if (expiresInSeconds) {
      newWorkflow.expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    }

    try {
        const [result] = await this.db.insert(workflows).values(newWorkflow).returning();
        return result;
    } catch (error) {
        // This is a common error when the unique constraint `uq_active_workflow` is violated.
        if (error instanceof Error && error.message.includes('duplicate key value violates unique constraint')) {
            throw new ConflictError(
                `An active workflow of type '${workflowType}' with reference ID '${workflowReferenceId}' already exists.`
            );
        }
        throw error;
    }
  }

  /**
   * Transitions a workflow from its current state to a new state.
   * Implements optimistic locking using a version number to prevent race conditions.
   *
   * @param workflowId - The UUID of the workflow to transition.
   * @param expectedVersion - The version number of the workflow that the caller expects to be updating.
   * @param params - The parameters for the state transition.
   * @returns The updated workflow object.
   * @throws {NotFoundError} If the workflow with the specified ID is not found.
   * @throws {ConflictError} If the expected version does not match the current version (race condition).
   */
  public async transition(
    workflowId: string,
    expectedVersion: number,
    params: TransitionWorkflowParams
  ): Promise<Workflow> {
    const { toState, reason, updatePayload, lastModifiedBy } = params;

    const workflow = await this.get(workflowId);
    if (!workflow) {
      throw new NotFoundError(`Workflow with ID '${workflowId}' not found.`);
    }

    const newPayload = updatePayload
      ? { ...workflow.payload, ...updatePayload }
      : workflow.payload;

    const results = await this.db
      .update(workflows)
      .set({
        currentState: toState,
        payload: newPayload,
        version: expectedVersion + 1,
        transitionReason: reason,
        lastModifiedBy,
        lastTransitionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(workflows.id, workflowId), eq(workflows.version, expectedVersion)))
      .returning();
    
    if (results.length === 0) {
        const currentWorkflow = await this.get(workflowId);
        throw new ConflictError(
            `Failed to transition workflow ${workflowId}. Expected version ${expectedVersion}, but current version is ${currentWorkflow?.version ?? 'unknown'}.`
        );
    }

    return results[0];
  }

  /**
   * Retrieves a workflow by its unique ID.
   * @param id - The UUID of the workflow.
   * @returns The workflow object or null if not found.
   */
  public async get(id: string): Promise<Workflow | null> {
    const result = await this.db.query.workflows.findFirst({
      where: eq(workflows.id, id),
    });
    return result ?? null;
  }

  /**
   * Finds the single active workflow for a given type and reference ID.
   * Active is defined as any state that is not 'COMPLETED', 'FAILED', or 'EXPIRED'.
   * @param workflowType - The type of the workflow.
   * @param workflowReferenceId - The reference ID of the workflow's subject.
   * @returns The active workflow object or null if not found.
   */
  public async findActiveByReferenceId(
    workflowType: string,
    workflowReferenceId: string
  ): Promise<Workflow | null> {
    const result = await this.db.query.workflows.findFirst({
      where: and(
        eq(workflows.workflowType, workflowType),
        eq(workflows.workflowReferenceId, workflowReferenceId),
        not(inArray(workflows.currentState, ["COMPLETED", "FAILED", "EXPIRED"]))
      ),
    });
    return result ?? null;
  }

  /**
   * Finds all workflows of a specific type that are in a given state.
   * @param workflowType The type of the workflow.
   * @param state The state of the workflows to find.
   * @returns A list of workflow objects.
   */
  public async findByTypeAndState(workflowType: string, state: string): Promise<Workflow[]> {
    return this.db.query.workflows.findMany({
        where: and(
            eq(workflows.workflowType, workflowType),
            eq(workflows.currentState, state)
        )
    });
  }
  
  /**
   * Finds all expired workflows that are not yet marked as 'EXPIRED'.
   * This is intended for use by a cleanup cron job.
   * @returns A list of expired workflow objects.
   */
  public async findExpired(): Promise<Workflow[]> {
    const now = new Date();
    return this.db.query.workflows.findMany({
      where: and(
        lt(workflows.expiresAt, now),
        not(inArray(workflows.currentState, ["EXPIRED", "COMPLETED", "FAILED"]))
      )
    });
  }
}

// Export a singleton instance.
// The consumer must handle the case where the db is not available.
let instance: WorkflowManager | null = null;
try {
    instance = new WorkflowManager();
} catch (e) {
    console.error(e);
}

export const workflowManager = instance;