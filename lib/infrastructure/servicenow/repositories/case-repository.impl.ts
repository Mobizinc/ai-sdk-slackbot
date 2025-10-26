/**
 * Case Repository Implementation
 *
 * Implements CaseRepository interface using ServiceNowHttpClient
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { CaseRepository } from "./case-repository.interface";
import type {
  Case,
  CreateCaseInput,
  UpdateCaseInput,
  CaseSearchCriteria,
  CreateIncidentInput,
  Incident,
} from "../types/domain-models";
import type { CaseRecord, IncidentRecord, ServiceNowTableResponse } from "../types/api-responses";
import { mapCase, mapIncident } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";

/**
 * Configuration for Case Repository
 */
export interface CaseRepositoryConfig {
  caseTable: string; // e.g., "sn_customerservice_case"
  caseJournalTable?: string; // e.g., "sys_journal_field"
  incidentTable?: string; // e.g., "incident"
}

/**
 * ServiceNow Case Repository Implementation
 */
export class ServiceNowCaseRepository implements CaseRepository {
  private readonly caseTable: string;
  private readonly caseJournalTable: string;
  private readonly incidentTable: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<CaseRepositoryConfig>,
  ) {
    this.caseTable = config?.caseTable ?? "sn_customerservice_case";
    this.caseJournalTable = config?.caseJournalTable ?? "sys_journal_field";
    this.incidentTable = config?.incidentTable ?? "incident";
  }

  /**
   * Find a case by its number
   */
  async findByNumber(number: string): Promise<Case | null> {
    const response = await this.httpClient.get<CaseRecord>(
      `/api/now/table/${this.caseTable}`,
      {
        sysparm_query: `number=${number}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      },
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapCase(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Find a case by its sys_id
   */
  async findBySysId(sysId: string): Promise<Case | null> {
    try {
      const response = await this.httpClient.get<CaseRecord>(
        `/api/now/table/${this.caseTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return mapCase(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      // If 404, return null instead of throwing
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for cases matching criteria
   */
  async search(criteria: CaseSearchCriteria): Promise<Case[]> {
    const queryParts: string[] = [];

    if (criteria.number) {
      queryParts.push(`number=${criteria.number}`);
    }
    if (criteria.shortDescription) {
      queryParts.push(`short_descriptionLIKE${criteria.shortDescription}`);
    }
    if (criteria.account) {
      queryParts.push(`account=${criteria.account}`);
    }
    if (criteria.caller) {
      queryParts.push(`caller_id=${criteria.caller}`);
    }
    if (criteria.state) {
      queryParts.push(`state=${criteria.state}`);
    }
    if (criteria.priority) {
      queryParts.push(`priority=${criteria.priority}`);
    }
    if (criteria.category) {
      queryParts.push(`category=${criteria.category}`);
    }
    if (criteria.openedAfter) {
      queryParts.push(`opened_at>=${this.formatDate(criteria.openedAfter)}`);
    }
    if (criteria.openedBefore) {
      queryParts.push(`opened_at<=${this.formatDate(criteria.openedBefore)}`);
    }

    const query = queryParts.join("^");
    const response = await this.httpClient.get<CaseRecord>(
      `/api/now/table/${this.caseTable}`,
      {
        sysparm_query: query || undefined,
        sysparm_limit: criteria.limit ?? 100,
        sysparm_display_value: "all",
        sysparm_order_by: "^ORDERBYDESCopened_at",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record) => mapCase(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Create a new case
   */
  async create(input: CreateCaseInput): Promise<Case> {
    const payload: Record<string, any> = {
      short_description: input.shortDescription,
    };

    if (input.description) payload.description = input.description;
    if (input.callerId) payload.caller_id = input.callerId;
    if (input.contact) payload.contact = input.contact;
    if (input.account) payload.account = input.account;
    if (input.category) payload.category = input.category;
    if (input.subcategory) payload.subcategory = input.subcategory;
    if (input.priority) payload.priority = input.priority;
    if (input.assignmentGroup) payload.assignment_group = input.assignmentGroup;

    const response = await this.httpClient.post<CaseRecord>(
      `/api/now/table/${this.caseTable}`,
      payload,
      {
        skipRetry: false,
      },
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapCase(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Update an existing case
   */
  async update(sysId: string, updates: UpdateCaseInput): Promise<Case> {
    const payload: Record<string, any> = {};

    if (updates.shortDescription) payload.short_description = updates.shortDescription;
    if (updates.description) payload.description = updates.description;
    if (updates.priority) payload.priority = updates.priority;
    if (updates.state) payload.state = updates.state;
    if (updates.category) payload.category = updates.category;
    if (updates.subcategory) payload.subcategory = updates.subcategory;
    if (updates.assignmentGroup) payload.assignment_group = updates.assignmentGroup;
    if (updates.assignedTo) payload.assigned_to = updates.assignedTo;

    const response = await this.httpClient.patch<CaseRecord>(
      `/api/now/table/${this.caseTable}/${sysId}`,
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapCase(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Add a work note to a case
   */
  async addWorkNote(sysId: string, note: string, isInternal: boolean): Promise<void> {
    const field = isInternal ? "work_notes" : "comments";
    await this.httpClient.patch(
      `/api/now/table/${this.caseTable}/${sysId}`,
      {
        [field]: note,
      },
    );
  }

  /**
   * Add a comment to a case (customer-visible)
   */
  async addComment(sysId: string, comment: string): Promise<void> {
    await this.addWorkNote(sysId, comment, false);
  }

  /**
   * Get work notes for a case
   */
  async getWorkNotes(sysId: string): Promise<Array<{ value: string; createdOn: Date; createdBy: string }>> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.caseJournalTable}`,
      {
        sysparm_query: `element_id=${sysId}^elementINwork_notes,comments`,
        sysparm_display_value: "all",
        sysparm_order_by: "sys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record: any) => ({
      value: record.value || "",
      createdOn: new Date(record.sys_created_on),
      createdBy: typeof record.sys_created_by === "object" ? record.sys_created_by.display_value : record.sys_created_by,
    }));
  }

  /**
   * Close a case
   */
  async close(sysId: string, closeCode?: string, closeNotes?: string): Promise<Case> {
    const payload: Record<string, any> = {
      state: "resolved", // or "closed" depending on your workflow
    };

    if (closeCode) payload.close_code = closeCode;
    if (closeNotes) payload.close_notes = closeNotes;

    return this.update(sysId, payload);
  }

  /**
   * Reopen a case
   */
  async reopen(sysId: string, reason?: string): Promise<Case> {
    const payload: Record<string, any> = {
      state: "open", // or appropriate open state
    };

    if (reason) {
      await this.addWorkNote(sysId, `Case reopened: ${reason}`, false);
    }

    return this.update(sysId, payload);
  }

  /**
   * Create an incident from a case
   */
  async createIncidentFromCase(caseSysId: string, input: CreateIncidentInput): Promise<Incident> {
    const payload: Record<string, any> = {
      short_description: input.shortDescription,
      parent: caseSysId,
    };

    if (input.description) payload.description = input.description;
    if (input.caller) payload.caller_id = input.caller;
    if (input.category) payload.category = input.category;
    if (input.priority) payload.priority = input.priority;
    if (input.assignmentGroup) payload.assignment_group = input.assignmentGroup;

    const response = await this.httpClient.post<IncidentRecord>(
      `/api/now/table/${this.incidentTable}`,
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapIncident(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Link a problem to a case
   */
  async linkProblem(caseSysId: string, problemSysId: string): Promise<void> {
    await this.httpClient.patch(
      `/api/now/table/${this.caseTable}/${caseSysId}`,
      {
        problem_id: problemSysId,
      },
    );
  }

  /**
   * Get cases related to an account
   */
  async findByAccount(accountSysId: string, limit = 100): Promise<Case[]> {
    return this.search({ account: accountSysId, limit });
  }

  /**
   * Get cases related to a caller
   */
  async findByCaller(callerSysId: string, limit = 100): Promise<Case[]> {
    return this.search({ caller: callerSysId, limit });
  }

  /**
   * Get all open cases
   */
  async findOpen(limit = 100): Promise<Case[]> {
    return this.search({ state: "open", limit });
  }

  /**
   * Format date for ServiceNow query
   */
  private formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());
    const seconds = pad(date.getUTCSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
