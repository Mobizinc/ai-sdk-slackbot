/**
 * Requested Item Repository Implementation
 *
 * Implements RequestedItemRepository interface using ServiceNowHttpClient
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { RequestedItemRepository } from "./requested-item-repository.interface";
import type { RequestedItem, RequestedItemSearchCriteria } from "../types/domain-models";
import type { RequestedItemRecord } from "../types/api-responses";
import { mapRequestedItem } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";

/**
 * Configuration for RequestedItem Repository
 */
export interface RequestedItemRepositoryConfig {
  requestedItemTable: string; // Default: "sc_req_item"
}

/**
 * ServiceNow RequestedItem Repository Implementation
 */
export class ServiceNowRequestedItemRepository implements RequestedItemRepository {
  private readonly requestedItemTable: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<RequestedItemRepositoryConfig>,
  ) {
    this.requestedItemTable = config?.requestedItemTable ?? "sc_req_item";
  }

  /**
   * Find a requested item by its number
   */
  async findByNumber(number: string): Promise<RequestedItem | null> {
    const response = await this.httpClient.get<RequestedItemRecord>(
      `/api/now/table/${this.requestedItemTable}`,
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
    return mapRequestedItem(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Find a requested item by its sys_id
   */
  async findBySysId(sysId: string): Promise<RequestedItem | null> {
    try {
      const response = await this.httpClient.get<RequestedItemRecord>(
        `/api/now/table/${this.requestedItemTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return mapRequestedItem(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      // If 404, return null instead of throwing
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for requested items matching the provided criteria
   */
  async search(criteria: RequestedItemSearchCriteria): Promise<{ items: RequestedItem[]; totalCount: number }> {
    const queryParts: string[] = [];

    if (criteria.number) {
      queryParts.push(`number=${criteria.number}`);
    }
    if (criteria.request) {
      queryParts.push(`request=${criteria.request}`);
    }
    if (criteria.catalogItem) {
      queryParts.push(`cat_item=${criteria.catalogItem}`);
    }
    if (criteria.state) {
      queryParts.push(`state=${criteria.state}`);
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

    const response = await this.httpClient.get<RequestedItemRecord>(
      `/api/now/table/${this.requestedItemTable}`,
      params,
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    const items = records.map((record) => mapRequestedItem(record, this.httpClient.getInstanceUrl()));

    // Get total count from headers if available
    const totalCount = response.headers?.["x-total-count"]
      ? parseInt(response.headers["x-total-count"], 10)
      : items.length;

    return { items, totalCount };
  }

  /**
   * Find requested items for a specific request (parent)
   */
  async findByRequest(requestSysId: string, limit = 10): Promise<RequestedItem[]> {
    const response = await this.httpClient.get<RequestedItemRecord>(
      `/api/now/table/${this.requestedItemTable}`,
      {
        sysparm_query: `request=${requestSysId}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapRequestedItem(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find requested items by catalog item
   */
  async findByCatalogItem(catalogItemSysId: string, limit = 10): Promise<RequestedItem[]> {
    const response = await this.httpClient.get<RequestedItemRecord>(
      `/api/now/table/${this.requestedItemTable}`,
      {
        sysparm_query: `cat_item=${catalogItemSysId}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapRequestedItem(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find requested items in a specific state
   */
  async findByState(state: string, limit = 10): Promise<RequestedItem[]> {
    const response = await this.httpClient.get<RequestedItemRecord>(
      `/api/now/table/${this.requestedItemTable}`,
      {
        sysparm_query: `state=${state}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapRequestedItem(record, this.httpClient.getInstanceUrl()));
  }
}
