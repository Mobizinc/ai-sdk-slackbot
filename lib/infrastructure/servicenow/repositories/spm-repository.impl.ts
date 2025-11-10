/**
 * SPM (Service Portfolio Management) Repository Implementation
 *
 * Implements SPMRepository interface using ServiceNowHttpClient
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { SPMRepository } from "./spm-repository.interface";
import type {
  SPMProject,
  SPMEpic,
  SPMStory,
  CreateSPMProjectInput,
  UpdateSPMProjectInput,
  SPMSearchCriteria,
} from "../types/domain-models";
import { extractDisplayValue, extractSysId, parseServiceNowDate } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";
import { SPM_PROJECT_STATES, SPM_TABLES, isSPMProjectActive } from "../spm/constants";

/**
 * Configuration for SPM Repository
 */
export interface SPMRepositoryConfig {
  projectTable: string; // e.g., "pm_project"
  epicTable: string; // e.g., "pm_epic" or "rm_epic"
  storyTable: string; // e.g., "rm_story"
  journalTable?: string; // e.g., "sys_journal_field"
}

/**
 * ServiceNow SPM Repository Implementation
 */
export class ServiceNowSPMRepository implements SPMRepository {
  private readonly projectTable: string;
  private readonly epicTable: string;
  private readonly storyTable: string;
  private readonly journalTable: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<SPMRepositoryConfig>,
  ) {
    this.projectTable = config?.projectTable ?? SPM_TABLES.PROJECT;
    this.epicTable = config?.epicTable ?? SPM_TABLES.EPIC;
    this.storyTable = config?.storyTable ?? SPM_TABLES.STORY;
    this.journalTable = config?.journalTable ?? "sys_journal_field";
  }

  /**
   * Find a project by its number
   */
  async findByNumber(number: string): Promise<SPMProject | null> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.projectTable}`,
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
    return this.mapProject(record);
  }

  /**
   * Find a project by its sys_id
   */
  async findBySysId(sysId: string): Promise<SPMProject | null> {
    try {
      const response = await this.httpClient.get<any>(
        `/api/now/table/${this.projectTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return this.mapProject(record);
    } catch (error) {
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for projects matching criteria
   */
  async search(criteria: SPMSearchCriteria): Promise<{ projects: SPMProject[]; totalCount: number }> {
    const queryParts: string[] = [];

    // Sort configuration
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
      queryParts.push(`short_descriptionLIKE${criteria.query}^ORdescriptionLIKE${criteria.query}`);
    }

    if (criteria.state) {
      queryParts.push(`state=${criteria.state}`);
    }

    if (criteria.priority) {
      queryParts.push(`priority=${criteria.priority}`);
    }

    if (criteria.assignedTo) {
      queryParts.push(`assigned_to.nameLIKE${criteria.assignedTo}^ORassigned_to=${criteria.assignedTo}`);
    }

    if (criteria.assignmentGroup) {
      queryParts.push(`assignment_group.nameLIKE${criteria.assignmentGroup}^ORassignment_group=${criteria.assignmentGroup}`);
    }

    if (criteria.projectManager) {
      queryParts.push(`project_manager.nameLIKE${criteria.projectManager}^ORproject_manager=${criteria.projectManager}`);
    }

    if (criteria.parent) {
      queryParts.push(`parent=${criteria.parent}`);
    }

    if (criteria.portfolio) {
      queryParts.push(`portfolio=${criteria.portfolio}`);
    }

    if (criteria.lifecycleStage) {
      queryParts.push(`lifecycle_stage=${criteria.lifecycleStage}`);
    }

    if (criteria.activeOnly) {
      const closedStates = [
        SPM_PROJECT_STATES.CLOSED_COMPLETE,
        SPM_PROJECT_STATES.CLOSED_INCOMPLETE,
        SPM_PROJECT_STATES.CLOSED_CANCELLED,
      ];
      queryParts.push(`stateNOT IN${closedStates.join(',')}`);
    }

    if (criteria.openedAfter) {
      const dateStr = criteria.openedAfter.toISOString().split('T')[0];
      queryParts.push(`opened_at>=${dateStr}`);
    }

    if (criteria.openedBefore) {
      const dateStr = criteria.openedBefore.toISOString().split('T')[0];
      queryParts.push(`opened_at<=${dateStr}`);
    }

    if (criteria.dueBefore) {
      const dateStr = criteria.dueBefore.toISOString().split('T')[0];
      queryParts.push(`due_date<=${dateStr}`);
    }

    const query = queryParts.join('^');

    // Get total count first
    const countResponse = await this.httpClient.get<any>(
      `/api/now/table/${this.projectTable}`,
      {
        sysparm_query: query,
        sysparm_count: true,
      },
    );

    const totalCount = countResponse.headers?.['x-total-count']
      ? parseInt(countResponse.headers['x-total-count'], 10)
      : 0;

    // Get records
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.projectTable}`,
      {
        sysparm_query: query,
        sysparm_limit: criteria.limit ?? 50,
        sysparm_offset: criteria.offset ?? 0,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    const projects = records.map((record) => this.mapProject(record));

    return { projects, totalCount };
  }

  /**
   * Find projects by state
   */
  async findByState(state: string, limit?: number): Promise<SPMProject[]> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.projectTable}`,
      {
        sysparm_query: `state=${state}^ORDERBYDESCopened_at`,
        sysparm_limit: limit ?? 50,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    return records.map((record) => this.mapProject(record));
  }

  /**
   * Find projects by assignment
   */
  async findByAssignment(assignedTo?: string, assignmentGroup?: string): Promise<SPMProject[]> {
    const queryParts: string[] = [];

    if (assignedTo) {
      queryParts.push(`assigned_to=${assignedTo}`);
    }

    if (assignmentGroup) {
      if (queryParts.length > 0) {
        queryParts.push('^OR');
      }
      queryParts.push(`assignment_group=${assignmentGroup}`);
    }

    if (queryParts.length === 0) {
      return [];
    }

    const query = `${queryParts.join('')}^ORDERBYDESCopened_at`;

    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.projectTable}`,
      {
        sysparm_query: query,
        sysparm_limit: 100,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    return records.map((record) => this.mapProject(record));
  }

  /**
   * Find child projects of a parent project
   */
  async findByParent(parentSysId: string): Promise<SPMProject[]> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.projectTable}`,
      {
        sysparm_query: `parent=${parentSysId}^ORDERBYnumber`,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    return records.map((record) => this.mapProject(record));
  }

  /**
   * Create a new SPM project
   */
  async create(input: CreateSPMProjectInput): Promise<SPMProject> {
    const payload: Record<string, any> = {
      short_description: input.shortDescription,
    };

    if (input.description) payload.description = input.description;
    if (input.assignedTo) payload.assigned_to = input.assignedTo;
    if (input.assignmentGroup) payload.assignment_group = input.assignmentGroup;
    if (input.priority) payload.priority = input.priority;
    if (input.parent) payload.parent = input.parent;
    if (input.dueDate) payload.due_date = input.dueDate;
    if (input.startDate) payload.start_date = input.startDate;
    if (input.projectManager) payload.project_manager = input.projectManager;
    if (input.sponsor) payload.sponsor = input.sponsor;
    if (input.portfolio) payload.portfolio = input.portfolio;
    if (input.lifecycleStage) payload.lifecycle_stage = input.lifecycleStage;

    const response = await this.httpClient.post<any>(
      `/api/now/table/${this.projectTable}`,
      payload,
      {
        skipRetry: false,
      },
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return this.mapProject(record);
  }

  /**
   * Update an existing SPM project
   */
  async update(sysId: string, updates: UpdateSPMProjectInput): Promise<SPMProject> {
    const payload: Record<string, any> = {};

    if (updates.shortDescription) payload.short_description = updates.shortDescription;
    if (updates.description) payload.description = updates.description;
    if (updates.state) payload.state = updates.state;
    if (updates.assignedTo) payload.assigned_to = updates.assignedTo;
    if (updates.assignmentGroup) payload.assignment_group = updates.assignmentGroup;
    if (updates.percentComplete !== undefined) payload.percent_complete = updates.percentComplete;
    if (updates.priority) payload.priority = updates.priority;
    if (updates.dueDate) payload.due_date = updates.dueDate;
    if (updates.projectManager) payload.project_manager = updates.projectManager;
    if (updates.sponsor) payload.sponsor = updates.sponsor;
    if (updates.lifecycleStage) payload.lifecycle_stage = updates.lifecycleStage;

    const response = await this.httpClient.patch<any>(
      `/api/now/table/${this.projectTable}/${sysId}`,
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return this.mapProject(record);
  }

  /**
   * Add a work note to a project
   */
  async addWorkNote(sysId: string, note: string, isInternal: boolean): Promise<void> {
    const field = isInternal ? "work_notes" : "comments";
    await this.httpClient.patch(
      `/api/now/table/${this.projectTable}/${sysId}`,
      {
        [field]: note,
      },
    );
  }

  /**
   * Get work notes for a project
   */
  async getWorkNotes(sysId: string): Promise<Array<{ value: string; createdOn: Date; createdBy: string }>> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.journalTable}`,
      {
        sysparm_query: `element_id=${sysId}^elementINwork_notes,comments`,
        sysparm_display_value: "all",
        sysparm_order_by: "sys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    return records.map((record: any) => ({
      value: record.value || "",
      createdOn: parseServiceNowDate(record.sys_created_on) ?? new Date(),
      createdBy: extractDisplayValue(record.sys_created_by),
    }));
  }

  /**
   * Find related epics for a project
   */
  async findRelatedEpics(projectSysId: string): Promise<SPMEpic[]> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.epicTable}`,
      {
        sysparm_query: `parent=${projectSysId}^ORDERBYnumber`,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    return records.map((record) => this.mapEpic(record));
  }

  /**
   * Find related stories for a project (via epics)
   */
  async findRelatedStories(projectSysId: string): Promise<SPMStory[]> {
    // First get all epics for the project
    const epics = await this.findRelatedEpics(projectSysId);
    if (epics.length === 0) {
      return [];
    }

    const epicSysIds = epics.map(epic => epic.sysId);
    const query = `parentIN${epicSysIds.join(',')}^ORDERBYnumber`;

    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.storyTable}`,
      {
        sysparm_query: query,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    return records.map((record) => this.mapStory(record));
  }

  /**
   * Find all active projects (not closed/cancelled)
   */
  async findActive(limit?: number): Promise<SPMProject[]> {
    const closedStates = [
      SPM_PROJECT_STATES.CLOSED_COMPLETE,
      SPM_PROJECT_STATES.CLOSED_INCOMPLETE,
      SPM_PROJECT_STATES.CLOSED_CANCELLED,
    ];
    const query = `stateNOT IN${closedStates.join(',')}^ORDERBYDESCopened_at`;

    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.projectTable}`,
      {
        sysparm_query: query,
        sysparm_limit: limit ?? 100,
        sysparm_display_value: "all",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    return records.map((record) => this.mapProject(record));
  }

  /**
   * Close a project
   */
  async close(sysId: string, complete: boolean, closeNotes?: string): Promise<SPMProject> {
    const payload: Record<string, any> = {
      state: complete ? SPM_PROJECT_STATES.CLOSED_COMPLETE : SPM_PROJECT_STATES.CLOSED_INCOMPLETE,
    };

    if (closeNotes) {
      payload.close_notes = closeNotes;
    }

    return this.update(sysId, payload);
  }

  /**
   * Map ServiceNow project record to domain model
   */
  private mapProject(record: any): SPMProject {
    const sysId = extractSysId(record.sys_id) || record.sys_id || "";
    const instanceUrl = this.httpClient.getInstanceUrl();

    return {
      sysId,
      number: extractDisplayValue(record.number),
      shortDescription: extractDisplayValue(record.short_description),
      description: extractDisplayValue(record.description),
      state: extractDisplayValue(record.state),
      priority: extractDisplayValue(record.priority),
      assignedTo: extractDisplayValue(record.assigned_to),
      assignedToName: extractDisplayValue(record.assigned_to),
      assignedToSysId: extractSysId(record.assigned_to),
      assignmentGroup: extractDisplayValue(record.assignment_group),
      assignmentGroupName: extractDisplayValue(record.assignment_group),
      assignmentGroupSysId: extractSysId(record.assignment_group),
      parent: extractSysId(record.parent),
      parentNumber: extractDisplayValue(record.parent),
      openedAt: parseServiceNowDate(record.opened_at),
      closedAt: parseServiceNowDate(record.closed_at),
      dueDate: parseServiceNowDate(record.due_date),
      startDate: parseServiceNowDate(record.start_date),
      endDate: parseServiceNowDate(record.end_date),
      percentComplete: record.percent_complete ? parseInt(record.percent_complete, 10) : undefined,
      cost: record.cost ? parseFloat(record.cost) : undefined,
      projectManager: extractDisplayValue(record.project_manager),
      projectManagerName: extractDisplayValue(record.project_manager),
      projectManagerSysId: extractSysId(record.project_manager),
      sponsor: extractDisplayValue(record.sponsor),
      sponsorName: extractDisplayValue(record.sponsor),
      portfolio: extractDisplayValue(record.portfolio),
      portfolioName: extractDisplayValue(record.portfolio),
      lifecycleStage: extractDisplayValue(record.lifecycle_stage),
      active: record.active === "true" || record.active === true,
      url: `${instanceUrl}/pm_project.do?sys_id=${sysId}`,
    };
  }

  /**
   * Map ServiceNow epic record to domain model
   */
  private mapEpic(record: any): SPMEpic {
    const sysId = extractSysId(record.sys_id) || record.sys_id || "";
    const instanceUrl = this.httpClient.getInstanceUrl();

    return {
      sysId,
      number: extractDisplayValue(record.number),
      shortDescription: extractDisplayValue(record.short_description),
      description: extractDisplayValue(record.description),
      state: extractDisplayValue(record.state),
      parent: extractSysId(record.parent) || "",
      parentNumber: extractDisplayValue(record.parent),
      assignedTo: extractDisplayValue(record.assigned_to),
      assignedToName: extractDisplayValue(record.assigned_to),
      priority: extractDisplayValue(record.priority),
      percentComplete: record.percent_complete ? parseInt(record.percent_complete, 10) : undefined,
      dueDate: parseServiceNowDate(record.due_date),
      url: `${instanceUrl}/${this.epicTable}.do?sys_id=${sysId}`,
    };
  }

  /**
   * Map ServiceNow story record to domain model
   */
  private mapStory(record: any): SPMStory {
    const sysId = extractSysId(record.sys_id) || record.sys_id || "";
    const instanceUrl = this.httpClient.getInstanceUrl();

    return {
      sysId,
      number: extractDisplayValue(record.number),
      shortDescription: extractDisplayValue(record.short_description),
      description: extractDisplayValue(record.description),
      state: extractDisplayValue(record.state),
      parent: extractSysId(record.parent) || "",
      parentNumber: extractDisplayValue(record.parent),
      assignedTo: extractDisplayValue(record.assigned_to),
      assignedToName: extractDisplayValue(record.assigned_to),
      priority: extractDisplayValue(record.priority),
      storyPoints: record.story_points ? parseInt(record.story_points, 10) : undefined,
      sprintSysId: extractSysId(record.sprint),
      url: `${instanceUrl}/rm_story.do?sys_id=${sysId}`,
    };
  }
}
