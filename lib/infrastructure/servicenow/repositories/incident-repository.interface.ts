/**
 * Incident Repository Interface
 *
 * Provides a collection-oriented interface for Incident operations
 */

import type { Incident } from "../types/domain-models";

/**
 * Repository interface for Incident entity operations
 */
export interface IncidentRepository {
  /**
   * Find an incident by its number (e.g., "INC0001234")
   */
  findByNumber(number: string): Promise<Incident | null>;

  /**
   * Find an incident by its sys_id
   */
  findBySysId(sysId: string): Promise<Incident | null>;

  /**
   * Get incidents related to a specific parent case
   */
  findByParent(parentSysId: string): Promise<Incident[]>;

  /**
   * Create a new incident
   */
  create(input: {
    shortDescription: string;
    description?: string;
    caller?: string;
    category?: string;
    priority?: string;
    assignmentGroup?: string;
    parent?: string;
  }): Promise<Incident>;

  /**
   * Update an existing incident
   */
  update(
    sysId: string,
    updates: {
      shortDescription?: string;
      description?: string;
      state?: string;
      priority?: string;
      assignmentGroup?: string;
    },
  ): Promise<Incident>;

  /**
   * Add a work note to an incident
   */
  addWorkNote(sysId: string, note: string): Promise<void>;

  /**
   * Close an incident
   */
  close(sysId: string, closeCode?: string, closeNotes?: string): Promise<Incident>;

  /**
   * Resolve an incident
   */
  resolve(sysId: string, resolutionCode?: string, resolutionNotes?: string): Promise<Incident>;

  /**
   * Search for resolved incidents with specific criteria
   * Used by cron job to find incidents eligible for closure
   */
  findResolved(options: {
    limit?: number;
    olderThanMinutes?: number;
    requireParentCase?: boolean;
    requireEmptyCloseCode?: boolean;
  }): Promise<Incident[]>;
}
