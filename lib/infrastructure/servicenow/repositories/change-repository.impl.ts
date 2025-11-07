/**
 * Change Request Repository Implementation
 *
 * Provides high-level methods for working with ServiceNow Change Requests.
 * Built on top of ServiceNowTableAPIClient for reusable operations.
 */

import { ServiceNowTableAPIClient, type PaginatedQueryOptions } from "../client/table-api-client";

export interface ChangeRequest {
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  state: string;
  type: string;
  template?: any;
  assignment_group?: any;
  assigned_to?: any;
  start_date?: string;
  end_date?: string;
  work_start?: string;
  work_end?: string;
  business_justification?: string;
  implementation_plan?: string;
  rollback_plan?: string;
  test_plan?: string;
  risk?: string;
  impact?: string;
  priority?: string;
  category?: string;
  subcategory?: string;
  requested_by?: any;
  opened_at?: string;
  closed_at?: string;
  sys_created_on?: string;
  sys_updated_on?: string;
  sys_created_by?: string;
  sys_updated_by?: string;
  [key: string]: any; // Allow additional fields
}

export interface StateTransition {
  sys_id: string;
  change: any;
  state: string;
  from_state?: string;
  to_state?: string;
  sys_created_on: string;
  sys_created_by: string;
  [key: string]: any;
}

export interface ComponentReference {
  sys_id: string;
  change_request?: any;
  ci_item?: any;
  task?: any;
  sys_created_on: string;
  sys_created_by: string;
  [key: string]: any;
}

export interface RelatedRecord {
  sys_id: string;
  element_id?: string;
  element?: string;
  value?: string;
  sys_created_on: string;
  sys_created_by: string;
  [key: string]: any;
}

/**
 * Change Request Repository
 *
 * High-level interface for working with Change Requests in ServiceNow.
 */
export class ChangeRepository {
  constructor(private readonly tableClient: ServiceNowTableAPIClient) {}

  /**
   * Fetch all changes matching a query
   *
   * @param query - Encoded query string or query object
   * @param options - Pagination and query options
   */
  async fetchChanges(
    query?: string | Record<string, any>,
    options: PaginatedQueryOptions = {}
  ): Promise<ChangeRequest[]> {
    const sysparmQuery =
      typeof query === "string"
        ? query
        : query
        ? ServiceNowTableAPIClient.buildQuery(query)
        : undefined;

    return this.tableClient.fetchAll<ChangeRequest>("change_request", {
      ...options,
      sysparm_query: sysparmQuery,
      sysparm_display_value: options.sysparm_display_value ?? "all",
    });
  }

  /**
   * Fetch a single change by sys_id
   */
  async fetchChangeById(sysId: string): Promise<ChangeRequest | null> {
    return this.tableClient.fetchById<ChangeRequest>("change_request", sysId, {
      sysparm_display_value: "all",
    });
  }

  /**
   * Fetch a single change by change number
   */
  async fetchChangeByNumber(changeNumber: string): Promise<ChangeRequest | null> {
    const results = await this.fetchChanges(`number=${changeNumber}`, {
      maxRecords: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Fetch state transitions (change tasks) for a change
   *
   * @param changeSysId - Change sys_id
   * @returns Array of state transitions
   */
  async fetchStateTransitions(changeSysId: string): Promise<StateTransition[]> {
    return this.tableClient.fetchAll<StateTransition>("change_task", {
      sysparm_query: `change_request=${changeSysId}`,
      sysparm_display_value: "all",
    });
  }

  /**
   * Fetch component references (CIs) for a change
   *
   * @param changeSysId - Change sys_id
   * @returns Array of component references
   */
  async fetchComponentReferences(changeSysId: string): Promise<ComponentReference[]> {
    return this.tableClient.fetchAll<ComponentReference>("task_ci", {
      sysparm_query: `task=${changeSysId}`,
      sysparm_display_value: "all",
    });
  }

  /**
   * Fetch work notes for a change
   *
   * @param changeSysId - Change sys_id
   * @returns Array of work notes
   */
  async fetchWorkNotes(changeSysId: string): Promise<RelatedRecord[]> {
    return this.tableClient.fetchAll<RelatedRecord>("sys_journal_field", {
      sysparm_query: `element_id=${changeSysId}^element=work_notes`,
      sysparm_display_value: "all",
    });
  }

  /**
   * Fetch comments for a change
   *
   * @param changeSysId - Change sys_id
   * @returns Array of comments
   */
  async fetchComments(changeSysId: string): Promise<RelatedRecord[]> {
    return this.tableClient.fetchAll<RelatedRecord>("sys_journal_field", {
      sysparm_query: `element_id=${changeSysId}^element=comments`,
      sysparm_display_value: "all",
    });
  }

  /**
   * Fetch attachments for a change
   *
   * @param changeSysId - Change sys_id
   * @returns Array of attachment metadata
   */
  async fetchAttachments(changeSysId: string): Promise<RelatedRecord[]> {
    return this.tableClient.fetchAll<RelatedRecord>("sys_attachment", {
      sysparm_query: `table_sys_id=${changeSysId}`,
      sysparm_display_value: "all",
    });
  }

  /**
   * Fetch complete change with all related records
   *
   * @param changeSysId - Change sys_id
   * @returns Complete change data with related records
   */
  async fetchCompleteChange(changeSysId: string): Promise<{
    change: ChangeRequest | null;
    stateTransitions: StateTransition[];
    componentReferences: ComponentReference[];
    workNotes: RelatedRecord[];
    comments: RelatedRecord[];
    attachments: RelatedRecord[];
  }> {
    // Fetch all data in parallel
    const [change, stateTransitions, componentReferences, workNotes, comments, attachments] =
      await Promise.all([
        this.fetchChangeById(changeSysId),
        this.fetchStateTransitions(changeSysId),
        this.fetchComponentReferences(changeSysId),
        this.fetchWorkNotes(changeSysId),
        this.fetchComments(changeSysId),
        this.fetchAttachments(changeSysId),
      ]);

    return {
      change,
      stateTransitions,
      componentReferences,
      workNotes,
      comments,
      attachments,
    };
  }

  /**
   * Fetch standard changes by short description pattern
   *
   * @param descriptionPattern - Short description pattern
   * @param options - Query options
   */
  async fetchStandardChanges(
    descriptionPattern: string = "Standard Change for ServiceNow Platform Updates",
    options: PaginatedQueryOptions = {}
  ): Promise<ChangeRequest[]> {
    return this.fetchChanges(`short_description=${descriptionPattern}^ORDERBYDESCsys_created_on`, {
      ...options,
      sysparm_display_value: "all",
    });
  }

  /**
   * Create a new change request
   */
  async createChange(data: Partial<ChangeRequest>): Promise<ChangeRequest> {
    return this.tableClient.create<ChangeRequest>("change_request", data);
  }

  /**
   * Update a change request
   */
  async updateChange(sysId: string, data: Partial<ChangeRequest>): Promise<ChangeRequest> {
    return this.tableClient.patch<ChangeRequest>("change_request", sysId, data);
  }

  /**
   * Add a work note to a change
   */
  async addWorkNote(changeSysId: string, note: string): Promise<ChangeRequest> {
    return this.updateChange(changeSysId, {
      work_notes: note,
    });
  }

  /**
   * Get the underlying table client for advanced operations
   */
  getTableClient(): ServiceNowTableAPIClient {
    return this.tableClient;
  }
}
