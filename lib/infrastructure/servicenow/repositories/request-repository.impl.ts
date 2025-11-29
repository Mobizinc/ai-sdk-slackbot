/**
 * Request Repository Implementation
 *
 * Implements RequestRepository interface using ServiceNowHttpClient
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { RequestRepository } from "./request-repository.interface";
import type { Request, RequestSearchCriteria } from "../types/domain-models";
import type { RequestRecord } from "../types/api-responses";
import { mapRequest } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";

/**
 * Configuration for Request Repository
 */
export interface RequestRepositoryConfig {
  requestTable: string; // Default: "sc_request"
}

/**
 * ServiceNow Request Repository Implementation
 */
export class ServiceNowRequestRepository implements RequestRepository {
  private readonly requestTable: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<RequestRepositoryConfig>,
  ) {
    this.requestTable = config?.requestTable ?? "sc_request";
  }

  /**
   * Find a request by its number
   */
  async findByNumber(number: string): Promise<Request | null> {
    const response = await this.httpClient.get<RequestRecord>(
      `/api/now/table/${this.requestTable}`,
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
    return mapRequest(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Find a request by its sys_id
   */
  async findBySysId(sysId: string): Promise<Request | null> {
    try {
      const response = await this.httpClient.get<RequestRecord>(
        `/api/now/table/${this.requestTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return mapRequest(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      // If 404, return null instead of throwing
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for requests matching the provided criteria
   */
  async search(criteria: RequestSearchCriteria): Promise<{ requests: Request[]; totalCount: number }> {
    const queryParts: string[] = [];

    if (criteria.number) {
      queryParts.push(`number=${criteria.number}`);
    }
    if (criteria.requestedFor) {
      queryParts.push(`requested_for=${criteria.requestedFor}`);
    }
    if (criteria.requestedBy) {
      queryParts.push(`requested_by=${criteria.requestedBy}`);
    }
    if (criteria.state) {
      queryParts.push(`state=${criteria.state}`);
    }
    if (criteria.priority) {
      queryParts.push(`priority=${criteria.priority}`);
    }
    if (criteria.openedAfter) {
      queryParts.push(`opened_at>=${criteria.openedAfter.toISOString()}`);
    }
    if (criteria.openedBefore) {
      queryParts.push(`opened_at<=${criteria.openedBefore.toISOString()}`);
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

    const response = await this.httpClient.get<RequestRecord>(
      `/api/now/table/${this.requestTable}`,
      params,
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    const requests = records.map((record) => mapRequest(record, this.httpClient.getInstanceUrl()));

    // Get total count from headers if available
    const totalCount = response.headers?.["x-total-count"]
      ? parseInt(response.headers["x-total-count"], 10)
      : requests.length;

    return { requests, totalCount };
  }

  /**
   * Find requests for a specific user
   */
  async findByRequestedFor(userSysId: string, limit = 10): Promise<Request[]> {
    const response = await this.httpClient.get<RequestRecord>(
      `/api/now/table/${this.requestTable}`,
      {
        sysparm_query: `requested_for=${userSysId}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapRequest(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find requests in a specific state
   */
  async findByState(state: string, limit = 10): Promise<Request[]> {
    const response = await this.httpClient.get<RequestRecord>(
      `/api/now/table/${this.requestTable}`,
      {
        sysparm_query: `state=${state}`,
        sysparm_display_value: "all",
        sysparm_limit: limit,
        sysparm_order_by: "^ORDERBYDESCsys_created_on",
      },
    );

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    return records.map((record) => mapRequest(record, this.httpClient.getInstanceUrl()));
  }
}
