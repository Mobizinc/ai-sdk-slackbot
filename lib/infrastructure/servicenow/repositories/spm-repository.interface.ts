/**
 * SPM (Service Portfolio Management) Repository Interface
 *
 * Provides a collection-oriented interface for SPM Project operations,
 * abstracting ServiceNow REST API details for pm_project table
 */

import type {
  SPMProject,
  SPMEpic,
  SPMStory,
  CreateSPMProjectInput,
  UpdateSPMProjectInput,
  SPMSearchCriteria,
} from "../types/domain-models";

/**
 * Repository interface for SPM Project entity operations
 */
export interface SPMRepository {
  /**
   * Find a project by its number (e.g., "PRJ0001234")
   */
  findByNumber(number: string): Promise<SPMProject | null>;

  /**
   * Find a project by its sys_id
   */
  findBySysId(sysId: string): Promise<SPMProject | null>;

  /**
   * Search for projects matching criteria
   * Returns projects and total count from ServiceNow
   */
  search(criteria: SPMSearchCriteria): Promise<{ projects: SPMProject[]; totalCount: number }>;

  /**
   * Find projects by state
   * @param state - Project state (e.g., "-5" for Pending, "-3" for Work in Progress)
   * @param limit - Maximum number of results
   */
  findByState(state: string, limit?: number): Promise<SPMProject[]>;

  /**
   * Find projects by assignment
   * @param assignedTo - User sys_id or user name
   * @param assignmentGroup - Group sys_id or group name
   */
  findByAssignment(assignedTo?: string, assignmentGroup?: string): Promise<SPMProject[]>;

  /**
   * Find child projects of a parent project
   * @param parentSysId - Parent project sys_id
   */
  findByParent(parentSysId: string): Promise<SPMProject[]>;

  /**
   * Create a new SPM project
   */
  create(input: CreateSPMProjectInput): Promise<SPMProject>;

  /**
   * Update an existing SPM project
   */
  update(sysId: string, updates: UpdateSPMProjectInput): Promise<SPMProject>;

  /**
   * Add a work note to a project
   * @param isInternal - If true, adds internal work note; if false, adds customer-visible comment
   */
  addWorkNote(sysId: string, note: string, isInternal: boolean): Promise<void>;

  /**
   * Get work notes for a project (simplified format)
   */
  getWorkNotes(sysId: string): Promise<Array<{ value: string; createdOn: Date; createdBy: string }>>;

  /**
   * Find related epics for a project
   * @param projectSysId - Project sys_id
   */
  findRelatedEpics(projectSysId: string): Promise<SPMEpic[]>;

  /**
   * Find related stories for a project (via epics)
   * @param projectSysId - Project sys_id
   */
  findRelatedStories(projectSysId: string): Promise<SPMStory[]>;

  /**
   * Find all active projects (not closed/cancelled)
   */
  findActive(limit?: number): Promise<SPMProject[]>;

  /**
   * Close a project
   * @param complete - If true, marks as complete; if false, marks as incomplete
   */
  close(sysId: string, complete: boolean, closeNotes?: string): Promise<SPMProject>;
}
