/**
 * Catalog Task Repository Implementation
 *
 * Implements CatalogTaskRepository interface using ServiceNowHttpClient
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { CatalogTaskRepository } from "./catalog-task-repository.interface";
import type { CatalogTask, CatalogTaskSearchCriteria } from "../types/domain-models";
import type { CatalogTaskRecord } from "../types/api-responses";
import { mapCatalogTask } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";

/**
 * Configuration for CatalogTask Repository
 */
export interface CatalogTaskRepositoryConfig {
  catalogTaskTable: string; // Default: "sc_task"
}

/**
 * ServiceNow CatalogTask Repository Implementation
 */
export class ServiceNowCatalogTaskRepository implements CatalogTaskRepository {
  private readonly catalogTaskTable: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<CatalogTaskRepositoryConfig>,
  ) {
    this.catalogTaskTable = config?.catalogTaskTable ?? "sc_task";
  }

  /**
   * Find a catalog task by its number
   */
  async findByNumber(number: string): Promise<CatalogTask | null> {
    const response = await this.httpClient.get<CatalogTaskRecord>(
      `/api/now/table/${this.catalogTaskTable}`,
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
    return mapCatalogTask(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Find a catalog task by its sys_id
   */
  async findBySysId(sysId: string): Promise<CatalogTask | null> {
    try {
      const response = await this.httpClient.get<CatalogTaskRecord>(
        `/api/now/table/${this.catalogTaskTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return mapCatalogTask(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      // If 404, return null instead of throwing
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for catalog tasks matching the provided criteria
   */
  async search(criteria: CatalogTaskSearchCriteria): Promise<{ tasks: CatalogTask[]; totalCount: number }> {
    const queryParts: string[] = [];

    if (criteria.number) {
      queryParts.push(`number=${criteria.number}`);
    }
    if (criteria.requestItem) {
      queryParts.push(`request_item=${criteria.requestItem}`);
    }
    if (criteria.request) {
      queryParts.push(`request=${criteria.request}`);
    }
    if (criteria.state) {
      queryParts.push(`state=${criteria.state}`);
    }
    if (criteria.active !== undefined) {
      queryParts.push(`active=${criteria.active}`);
    }
    if (criteria.assignedTo) {
      queryParts.push(`assigned_to=${criteria.assignedTo}`);
    }
    if (criteria.assignmentGroup) {
      queryParts.push(`assignment_group=${criteria.assignmentGroup}`);
    }
    if (criteria.openedAfter) {
      queryParts.push(`opened_at>=${criteria.openedAfter.toISOString()}`);
    }

    const sysparmQuery = queryParts.join("^");

    // Build sort order
    let sortOrder = "";
    if (criteria.sortBy) {
      const orderPrefix = criteria.sortOrder === "desc" ? "^ORDERBYDESC" : "^ORDERBY";
      sortOrder = `${orderPrefix}${criteria.sortBy}`;
    }

    const params: Record<string, string | number> = {
      sysparm_display_value: "all",
    };

    if (sysparmQuery) {
      params.sysparm_query = sysparmQuery + sortOrder;
    } else if (sortOrder) {
      params.sysparm_query = sortOrder;
    }

    if (criteria.limit) {
      params.sysparm_limit = criteria.limit;
    }
    if (criteria.offset) {
      params.sysparm_offset = criteria.offset;
    }

    const response = await this.httpClient.get<CatalogTaskRecord>(
      `/api/now/table/${this.catalogTaskTable}`,
      params,
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    const tasks = records.map((record) => mapCatalogTask(record, this.httpClient.getInstanceUrl()));

    // Get total count from headers if available
    const totalCount = response.headers?.["x-total-count"]
      ? parseInt(response.headers["x-total-count"], 10)
      : tasks.length;

    return { tasks, totalCount };
  }

  /**
   * Find catalog tasks for a specific requested item (parent)
   */
  async findByRequestedItem(requestedItemSysId: string, limit = 10): Promise<CatalogTask[]> {
    const response = await this.httpClient.get<CatalogTaskRecord>(
      `/api/now/table/${this.catalogTaskTable}`,
      {
        sysparm_query: `request_item=${requestedItemSysId}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapCatalogTask(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find catalog tasks for a specific request (grandparent)
   */
  async findByRequest(requestSysId: string, limit = 10): Promise<CatalogTask[]> {
    const response = await this.httpClient.get<CatalogTaskRecord>(
      `/api/now/table/${this.catalogTaskTable}`,
      {
        sysparm_query: `request=${requestSysId}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapCatalogTask(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find catalog tasks in a specific state
   */
  async findByState(state: string, limit = 10): Promise<CatalogTask[]> {
    const response = await this.httpClient.get<CatalogTaskRecord>(
      `/api/now/table/${this.catalogTaskTable}`,
      {
        sysparm_query: `state=${state}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapCatalogTask(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find active catalog tasks
   */
  async findActive(limit = 10): Promise<CatalogTask[]> {
    const response = await this.httpClient.get<CatalogTaskRecord>(
      `/api/now/table/${this.catalogTaskTable}`,
      {
        sysparm_query: `active=true`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapCatalogTask(record, this.httpClient.getInstanceUrl()));
  }
}
