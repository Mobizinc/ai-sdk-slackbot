/**
 * Incident Repository Implementation
 *
 * Implements IncidentRepository interface using ServiceNowHttpClient
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { IncidentRepository } from "./incident-repository.interface";
import type { Incident } from "../types/domain-models";
import type { IncidentRecord, ServiceNowTableResponse } from "../types/api-responses";
import { mapIncident } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";

/**
 * Configuration for Incident Repository
 */
export interface IncidentRepositoryConfig {
  incidentTable: string; // e.g., "incident"
}

/**
 * ServiceNow Incident Repository Implementation
 */
export class ServiceNowIncidentRepository implements IncidentRepository {
  private readonly incidentTable: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<IncidentRepositoryConfig>,
  ) {
    this.incidentTable = config?.incidentTable ?? "incident";
  }

  /**
   * Find an incident by its number
   */
  async findByNumber(number: string): Promise<Incident | null> {
    const response = await this.httpClient.get<IncidentRecord>(
      `/api/now/table/${this.incidentTable}`,
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
    return mapIncident(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Find an incident by its sys_id
   */
  async findBySysId(sysId: string): Promise<Incident | null> {
    try {
      const response = await this.httpClient.get<IncidentRecord>(
        `/api/now/table/${this.incidentTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return mapIncident(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      // If 404, return null instead of throwing
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get incidents related to a specific parent case
   */
  async findByParent(parentSysId: string): Promise<Incident[]> {
    const response = await this.httpClient.get<IncidentRecord>(
      `/api/now/table/${this.incidentTable}`,
      {
        sysparm_query: `parent=${parentSysId}`,
        sysparm_display_value: "all",
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record) => mapIncident(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Create a new incident
   */
  async create(input: {
    shortDescription: string;
    description?: string;
    caller?: string;
    category?: string;
    priority?: string;
    assignmentGroup?: string;
    parent?: string;
  }): Promise<Incident> {
    const payload: Record<string, any> = {
      short_description: input.shortDescription,
    };

    if (input.description) payload.description = input.description;
    if (input.caller) payload.caller_id = input.caller;
    if (input.category) payload.category = input.category;
    if (input.priority) payload.priority = input.priority;
    if (input.assignmentGroup) payload.assignment_group = input.assignmentGroup;
    if (input.parent) payload.parent = input.parent;

    const response = await this.httpClient.post<IncidentRecord>(
      `/api/now/table/${this.incidentTable}`,
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapIncident(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Update an existing incident
   */
  async update(
    sysId: string,
    updates: {
      shortDescription?: string;
      description?: string;
      state?: string;
      priority?: string;
      assignmentGroup?: string;
    },
  ): Promise<Incident> {
    const payload: Record<string, any> = {};

    if (updates.shortDescription) payload.short_description = updates.shortDescription;
    if (updates.description) payload.description = updates.description;
    if (updates.state) payload.state = updates.state;
    if (updates.priority) payload.priority = updates.priority;
    if (updates.assignmentGroup) payload.assignment_group = updates.assignmentGroup;

    const response = await this.httpClient.patch<IncidentRecord>(
      `/api/now/table/${this.incidentTable}/${sysId}`,
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapIncident(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Add a work note to an incident
   */
  async addWorkNote(sysId: string, note: string): Promise<void> {
    await this.httpClient.patch(
      `/api/now/table/${this.incidentTable}/${sysId}`,
      {
        work_notes: note,
      },
    );
  }

  /**
   * Close an incident
   */
  async close(sysId: string, closeCode?: string, closeNotes?: string): Promise<Incident> {
    const payload: Record<string, any> = {
      state: "7", // Closed
      active: false,
    };

    if (closeCode) payload.close_code = closeCode;
    if (closeNotes) payload.close_notes = closeNotes;

    const response = await this.httpClient.patch<IncidentRecord>(
      `/api/now/table/${this.incidentTable}/${sysId}`,
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapIncident(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Resolve an incident
   */
  async resolve(sysId: string, resolutionCode?: string, resolutionNotes?: string): Promise<Incident> {
    const payload: Record<string, any> = {
      state: "6", // Resolved
    };

    if (resolutionCode) payload.close_code = resolutionCode;
    if (resolutionNotes) payload.close_notes = resolutionNotes;

    const response = await this.httpClient.patch<IncidentRecord>(
      `/api/now/table/${this.incidentTable}/${sysId}`,
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapIncident(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Search for resolved incidents with specific criteria
   * Used by cron job to find incidents eligible for closure
   */
  async findResolved(options: {
    limit?: number;
    olderThanMinutes?: number;
    requireParentCase?: boolean;
    requireEmptyCloseCode?: boolean;
  }): Promise<Incident[]> {
    const limit = options.limit ?? 50;
    const queryParts: string[] = [
      "state=6", // Resolved state
      "active=true",
    ];

    // Require parent case (linked to a customer service case)
    if (options.requireParentCase !== false) {
      queryParts.push("parentISNOTEMPTY");
    }

    // Require empty close code (not yet closed)
    if (options.requireEmptyCloseCode !== false) {
      queryParts.push("close_codeISEMPTY");
    }

    // Filter by age (resolved_at older than X minutes)
    if (options.olderThanMinutes && options.olderThanMinutes > 0) {
      queryParts.push(`resolved_atRELATIVELE@minute@ago@${Math.floor(options.olderThanMinutes)}`);
    }

    const query = queryParts.join("^");

    const response = await this.httpClient.get<IncidentRecord>(
      `/api/now/table/${this.incidentTable}`,
      {
        sysparm_query: query,
        sysparm_limit: limit,
        sysparm_display_value: "all",
        sysparm_fields: "sys_id,number,short_description,state,resolved_at,close_code,parent",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record) => mapIncident(record, this.httpClient.getInstanceUrl()));
  }
}
