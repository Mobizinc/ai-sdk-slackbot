/**
 * Case Repository Interface
 *
 * Provides a collection-oriented interface for Case operations,
 * abstracting ServiceNow REST API details
 */

import type {
  Case,
  CreateCaseInput,
  UpdateCaseInput,
  CaseSearchCriteria,
  CreateIncidentInput,
  Incident,
} from "../types/domain-models";

/**
 * Repository interface for Case entity operations
 */
export interface CaseRepository {
  /**
   * Find a case by its number (e.g., "CS0001234")
   */
  findByNumber(number: string): Promise<Case | null>;

  /**
   * Find a case by its sys_id
   */
  findBySysId(sysId: string): Promise<Case | null>;

  /**
   * Search for cases matching criteria
   */
  search(criteria: CaseSearchCriteria): Promise<Case[]>;

  /**
   * Create a new case
   */
  create(input: CreateCaseInput): Promise<Case>;

  /**
   * Update an existing case
   */
  update(sysId: string, updates: UpdateCaseInput): Promise<Case>;

  /**
   * Add a work note to a case
   * @param isInternal - If true, adds internal work note; if false, adds customer-visible comment
   */
  addWorkNote(sysId: string, note: string, isInternal: boolean): Promise<void>;

  /**
   * Add a comment to a case (customer-visible)
   */
  addComment(sysId: string, comment: string): Promise<void>;

  /**
   * Get work notes for a case (simplified format)
   */
  getWorkNotes(sysId: string): Promise<Array<{ value: string; createdOn: Date; createdBy: string }>>;

  /**
   * Get journal entries for a case (full ServiceNow format)
   * @param sysId - Case sys_id
   * @param options - Optional limit and journal name filter
   */
  getJournalEntries(
    sysId: string,
    options?: { limit?: number; journalName?: string },
  ): Promise<Array<{
    sysId: string;
    element: string;
    elementId: string;
    name?: string;
    createdOn: string;
    createdBy: string;
    value?: string;
  }>>;

  /**
   * Close a case
   */
  close(sysId: string, closeCode?: string, closeNotes?: string): Promise<Case>;

  /**
   * Reopen a case
   */
  reopen(sysId: string, reason?: string): Promise<Case>;

  /**
   * Create an incident from a case
   */
  createIncidentFromCase(caseSysId: string, input: CreateIncidentInput): Promise<Incident>;

  /**
   * Link a problem to a case
   */
  linkProblem(caseSysId: string, problemSysId: string): Promise<void>;

  /**
   * Get cases related to an account
   */
  findByAccount(accountSysId: string, limit?: number): Promise<Case[]>;

  /**
   * Get cases related to a caller
   */
  findByCaller(callerSysId: string, limit?: number): Promise<Case[]>;

  /**
   * Get all open cases
   */
  findOpen(limit?: number): Promise<Case[]>;
}
