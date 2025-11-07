/**
 * ServiceNow Table API Client
 *
 * High-level client for ServiceNow Table API operations with:
 * - Generic CRUD operations for any table
 * - Automatic pagination handling
 * - Query building utilities
 * - Batch operations support
 * - Type-safe operations with generics
 *
 * Built on top of ServiceNowHttpClient for retry logic and error handling.
 */

import { ServiceNowHttpClient, type RequestOptions } from "./http-client";
import type { ServiceNowTableResponse } from "../types/api-responses";

export interface TableAPIQueryParams {
  sysparm_query?: string;
  sysparm_display_value?: "true" | "false" | "all";
  sysparm_exclude_reference_link?: boolean;
  sysparm_fields?: string;
  sysparm_limit?: number;
  sysparm_offset?: number;
  sysparm_no_count?: boolean;
  sysparm_suppress_pagination_header?: boolean;
}

export interface PaginatedQueryOptions extends TableAPIQueryParams {
  maxRecords?: number; // Maximum total records to fetch (default: unlimited)
  pageSize?: number; // Records per page (default: 1000)
  onProgress?: (fetched: number, total?: number) => void; // Progress callback
}

export interface BatchOperation<T> {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  table: string;
  sysId?: string; // Required for PUT/PATCH/DELETE
  data?: Partial<T>; // Required for POST/PUT/PATCH
}

/**
 * ServiceNow Table API Client
 *
 * Provides high-level methods for interacting with any ServiceNow table.
 * Handles pagination, query building, and batch operations.
 */
export class ServiceNowTableAPIClient {
  constructor(private readonly httpClient: ServiceNowHttpClient) {}

  /**
   * Fetch all records from a table with automatic pagination
   *
   * @param table - Table name (e.g., 'change_request', 'incident', 'cmdb_ci')
   * @param options - Query and pagination options
   * @returns Array of all fetched records
   */
  async fetchAll<T = any>(
    table: string,
    options: PaginatedQueryOptions = {}
  ): Promise<T[]> {
    const {
      maxRecords,
      pageSize = 1000,
      onProgress,
      ...queryParams
    } = options;

    const allRecords: T[] = [];
    let offset = 0;
    let hasMore = true;
    let totalRecords: number | undefined;

    while (hasMore) {
      // Check if we've reached the max records limit
      if (maxRecords && allRecords.length >= maxRecords) {
        break;
      }

      // Calculate limit for this page
      const limit = maxRecords
        ? Math.min(pageSize, maxRecords - allRecords.length)
        : pageSize;

      // Build query parameters
      const params: TableAPIQueryParams = {
        ...queryParams,
        sysparm_limit: limit,
        sysparm_offset: offset,
      };

      // Fetch page
      const response = await this.httpClient.get<T>(
        `/api/now/table/${table}`,
        params
      );

      // Extract records
      const records = response.result || [];
      allRecords.push(...records);

      // Update total count (from first response)
      if (totalRecords === undefined && response.headers) {
        const countHeader = response.headers["x-total-count"];
        if (countHeader) {
          totalRecords = parseInt(countHeader, 10);
        }
      }

      // Call progress callback
      if (onProgress) {
        onProgress(allRecords.length, totalRecords);
      }

      // Check if we should fetch more
      if (records.length < limit) {
        hasMore = false; // Last page
      } else {
        offset += limit;
      }
    }

    return allRecords;
  }

  /**
   * Fetch a single record by sys_id
   *
   * @param table - Table name
   * @param sysId - Record sys_id
   * @param options - Query options
   * @returns Single record or null if not found
   */
  async fetchById<T = any>(
    table: string,
    sysId: string,
    options: Omit<TableAPIQueryParams, "sysparm_limit" | "sysparm_offset"> = {}
  ): Promise<T | null> {
    try {
      const response = await this.httpClient.get<T>(
        `/api/now/table/${table}/${sysId}`,
        options
      );
      return response.result || null;
    } catch (error: any) {
      // Return null if record not found (404)
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new record
   *
   * @param table - Table name
   * @param data - Record data
   * @param options - Request options
   * @returns Created record
   */
  async create<T = any>(
    table: string,
    data: Partial<T>,
    options?: RequestOptions
  ): Promise<T> {
    const response = await this.httpClient.post<T>(
      `/api/now/table/${table}`,
      data,
      options
    );
    return response.result!;
  }

  /**
   * Update an existing record (PUT - replaces entire record)
   *
   * @param table - Table name
   * @param sysId - Record sys_id
   * @param data - Complete record data
   * @param options - Request options
   * @returns Updated record
   */
  async update<T = any>(
    table: string,
    sysId: string,
    data: Partial<T>,
    options?: RequestOptions
  ): Promise<T> {
    const response = await this.httpClient.put<T>(
      `/api/now/table/${table}/${sysId}`,
      data,
      options
    );
    return response.result!;
  }

  /**
   * Patch an existing record (PATCH - partial update)
   *
   * @param table - Table name
   * @param sysId - Record sys_id
   * @param data - Partial record data
   * @param options - Request options
   * @returns Updated record
   */
  async patch<T = any>(
    table: string,
    sysId: string,
    data: Partial<T>,
    options?: RequestOptions
  ): Promise<T> {
    const response = await this.httpClient.patch<T>(
      `/api/now/table/${table}/${sysId}`,
      data,
      options
    );
    return response.result!;
  }

  /**
   * Delete a record
   *
   * @param table - Table name
   * @param sysId - Record sys_id
   * @param options - Request options
   */
  async delete(
    table: string,
    sysId: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.httpClient.delete(
      `/api/now/table/${table}/${sysId}`,
      options
    );
  }

  /**
   * Query builder helper - builds encoded query string
   *
   * @example
   * const query = buildQuery({
   *   state: 'Closed',
   *   priority: { operator: 'IN', values: ['1', '2'] },
   *   sys_created_on: { operator: '>=', value: '2025-01-01' }
   * });
   */
  static buildQuery(conditions: Record<string, any>): string {
    const queryParts: string[] = [];

    for (const [field, value] of Object.entries(conditions)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === "object" && "operator" in value) {
        // Handle complex operators
        const { operator, value: opValue, values } = value;

        if (operator === "IN" && Array.isArray(values)) {
          queryParts.push(`${field}IN${values.join(",")}`);
        } else if (opValue !== undefined) {
          queryParts.push(`${field}${operator}${opValue}`);
        }
      } else {
        // Simple equality
        queryParts.push(`${field}=${value}`);
      }
    }

    return queryParts.join("^");
  }

  /**
   * Get the underlying HTTP client instance
   */
  getHttpClient(): ServiceNowHttpClient {
    return this.httpClient;
  }

  /**
   * Get the ServiceNow instance URL
   */
  getInstanceUrl(): string {
    return this.httpClient.getInstanceUrl();
  }
}
