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
import { mapCase, mapIncident, parseServiceNowDate, extractDisplayValue } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";
import { buildFlexibleLikeQuery } from "./query-builders";

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
  async search(criteria: CaseSearchCriteria): Promise<{ cases: Case[]; totalCount: number }> {
    const queryParts: string[] = [];

    // Sort configuration (must be first in ServiceNow query)
    const sortField = criteria.sortBy || 'opened_at';
    const sortDirection = criteria.sortOrder === 'asc' ? '' : 'DESC';
    queryParts.push(`ORDERBY${sortDirection}${sortField}`);

    // Filter conditions
    if (criteria.number) {
      queryParts.push(`number=${criteria.number}`);
    }

    if (criteria.shortDescription) {
      queryParts.push(`short_descriptionLIKE${criteria.shortDescription}`);
    }

    if (criteria.query) {
      // Full-text search across short_description and description
      queryParts.push(`short_descriptionLIKE${criteria.query}^ORdescriptionLIKE${criteria.query}`);
    }

    if (criteria.account) {
      // Account by sys_id
      queryParts.push(`account=${criteria.account}`);
    }

    if (criteria.accountName) {
      // Account by display name (searches account.name reference field)
      const clause = buildFlexibleLikeQuery("account.name", criteria.accountName);
      if (clause) {
        queryParts.push(clause);
      }
    }

    if (criteria.companyName) {
      // Company by display name (searches company.name reference field)
      const clause = buildFlexibleLikeQuery("company.name", criteria.companyName);
      if (clause) {
        queryParts.push(clause);
      }
    }

    if (criteria.caller) {
      queryParts.push(`caller_id=${criteria.caller}`);
    }

    if (criteria.state) {
      const states = criteria.state
        .split(",")
        .map((state) => state.trim())
        .filter(Boolean);

      if (states.length === 1) {
        queryParts.push(`state=${states[0]}`);
      } else if (states.length > 1) {
        const stateQuery = states.map((state) => `state=${state}`).join("^OR");
        queryParts.push(`(${stateQuery})`);
      }
    }

    if (criteria.priority) {
      queryParts.push(`priority=${criteria.priority}`);
    }

    if (criteria.category) {
      queryParts.push(`category=${criteria.category}`);
    }

    if (criteria.assignmentGroup) {
      // Assignment group by display name - use exact match to avoid permissions issues with LIKE
      queryParts.push(`assignment_group.name=${criteria.assignmentGroup}`);
    }

    if (criteria.assignedTo) {
      // Assigned user by display name
      const clause = buildFlexibleLikeQuery("assigned_to.name", criteria.assignedTo);
      if (clause) {
        queryParts.push(clause);
      }
    }

    if (criteria.openedAfter) {
      queryParts.push(`opened_at>=${this.formatDate(criteria.openedAfter)}`);
    }

    if (criteria.openedBefore) {
      queryParts.push(`opened_at<=${this.formatDate(criteria.openedBefore)}`);
    }

    if (criteria.updatedAfter) {
      queryParts.push(`sys_updated_on>=${this.formatDate(criteria.updatedAfter)}`);
    }

    if (criteria.updatedBefore) {
      queryParts.push(`sys_updated_on<=${this.formatDate(criteria.updatedBefore)}`);
    }

    if (criteria.resolvedAfter) {
      queryParts.push(`resolved_at>=${this.formatDate(criteria.resolvedAfter)}`);
    }

    if (criteria.resolvedBefore) {
      queryParts.push(`resolved_at<=${this.formatDate(criteria.resolvedBefore)}`);
    }

    if (criteria.closedAfter) {
      queryParts.push(`closed_at>=${this.formatDate(criteria.closedAfter)}`);
    }

    if (criteria.closedBefore) {
      queryParts.push(`closed_at<=${this.formatDate(criteria.closedBefore)}`);
    }

    // Active/closed filter
    if (criteria.activeOnly !== undefined) {
      queryParts.push(`active=${criteria.activeOnly ? 'true' : 'false'}`);
    }

    // Domain filtering (multi-tenant support)
    if (criteria.sysDomain) {
      if (criteria.includeChildDomains) {
        // Hierarchical domain search: includes domain and all child domains
        queryParts.push(`sys_domainRELATIVE${criteria.sysDomain}`);
      } else {
        // Exact domain match
        queryParts.push(`sys_domain=${criteria.sysDomain}`);
      }
    }

    // If no filters specified (only sort parameter), default to active cases only
    if (queryParts.length === 1 && queryParts[0].startsWith('ORDERBY')) {
      queryParts.push('active=true');
    }

    const query = queryParts.join("^");
    const response = await this.httpClient.get<CaseRecord>(
      `/api/now/table/${this.caseTable}`,
      {
        sysparm_query: query,
        sysparm_limit: criteria.limit ?? 100,
        sysparm_offset: criteria.offset ?? 0,
        sysparm_display_value: "all",
      },
    );

    // Extract total count from response headers
    const totalCount = response.headers?.["x-total-count"]
      ? parseInt(response.headers["x-total-count"], 10)
      : 0;

    const records = Array.isArray(response.result) ? response.result : [response.result];
    const cases = records.map((record) => mapCase(record, this.httpClient.getInstanceUrl()));

    return { cases, totalCount };
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
   * Get work notes for a case (simplified format)
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
      createdOn: parseServiceNowDate(record.sys_created_on) ?? new Date(),
      createdBy: typeof record.sys_created_by === "object" ? record.sys_created_by.display_value : record.sys_created_by,
    }));
  }

  /**
   * Get journal entries for a case (full ServiceNow format)
   */
  async getJournalEntries(
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
  }>> {
    const queryParts = [`element_id=${sysId}`];

    // Filter by journal name if provided (e.g., "x_mobit_serv_case_service_case")
    if (options?.journalName) {
      queryParts.push(`name=${options.journalName}`);
    }

    const query = `${queryParts.join("^")}^ORDERBYDESCsys_created_on`;

    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.caseJournalTable}`,
      {
        sysparm_query: query,
        sysparm_limit: options?.limit ?? 20,
        sysparm_fields: "sys_id,element,element_id,name,sys_created_on,sys_created_by,value",
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record: any) => ({
      sysId: record.sys_id || "",
      element: record.element || "",
      elementId: extractDisplayValue(record.element_id) || "",
      name: typeof record.name === "object" ? record.name.display_value : record.name,
      createdOn: parseServiceNowDate(record.sys_created_on)?.toISOString() || "",
      createdBy: typeof record.sys_created_by === "object"
        ? record.sys_created_by.display_value
        : (record.sys_created_by || ""),
      value: typeof record.value === "object" ? record.value.display_value : record.value,
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
      description: input.description || input.shortDescription,
      parent: caseSysId,
      urgency: input.urgency || "3", // Default to medium urgency
      priority: input.priority || "3", // Default to medium priority
    };

    // Basic fields
    if (input.caller) payload.caller_id = input.caller;
    if (input.category) payload.category = input.category;
    if (input.subcategory) payload.subcategory = input.subcategory;
    if (input.assignmentGroup) payload.assignment_group = input.assignmentGroup;
    if (input.assignedTo) payload.assigned_to = input.assignedTo;
    if (input.impact) payload.impact = input.impact;

    // Company/Account context (prevents orphaned incidents)
    if (input.company) payload.company = input.company;
    if (input.account) payload.account = input.account;
    if (input.businessService) payload.business_service = input.businessService;
    if (input.location) payload.location = input.location;

    // Contact information
    if (input.contact) payload.contact = input.contact;
    if (input.contactType) payload.contact_type = input.contactType;
    if (input.openedBy) payload.opened_by = input.openedBy;

    // Technical context
    if (input.cmdbCi) payload.cmdb_ci = input.cmdbCi;

    if (input.workNotes) payload.work_notes = input.workNotes;
    if (input.customerNotes) payload.comments = input.customerNotes;

    // Multi-tenancy / Domain separation
    if (input.sysDomain) payload.sys_domain = input.sysDomain;
    if (input.sysDomainPath) payload.sys_domain_path = input.sysDomainPath;

    // Major incident handling
    if (input.isMajorIncident) {
      payload.severity = "1"; // SEV-1 for major incidents
      payload.impact = "1"; // High impact
    }

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
    const { cases } = await this.search({ account: accountSysId, limit });
    return cases;
  }

  /**
   * Get cases related to a caller
   */
  async findByCaller(callerSysId: string, limit = 100): Promise<Case[]> {
    const { cases } = await this.search({ caller: callerSysId, limit });
    return cases;
  }

  /**
   * Get all open cases
   */
  async findOpen(limit = 100): Promise<Case[]> {
    const { cases } = await this.search({ state: "open", limit });
    return cases;
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
