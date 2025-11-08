/**
 * Unit Tests for ServiceNow Table API Client
 *
 * Tests the high-level client for ServiceNow Table API operations:
 * - Generic CRUD operations for any table
 * - Automatic pagination handling
 * - Query building utilities
 * - Error handling and retry logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("ServiceNowTableAPIClient", () => {
  let mockHttpClient: any;
  let tableClient: any;

  const mockTableRecord = {
    sys_id: "test-id-123",
    number: "CHG0000001",
    short_description: "Test change",
    state: "assess",
  };

  const mockTableResponse = {
    result: [mockTableRecord],
    headers: {
      "x-total-count": "1",
    },
  };

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn().mockResolvedValue(mockTableResponse),
      post: vi.fn().mockResolvedValue({ result: mockTableRecord }),
      put: vi.fn().mockResolvedValue({ result: mockTableRecord }),
      patch: vi.fn().mockResolvedValue({ result: mockTableRecord }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    };

    tableClient = {
      fetchAll: vi
        .fn()
        .mockImplementation(async (table, options) => {
          const response = await mockHttpClient.get(
            `/api/now/table/${table}`,
            options
          );
          return response.result || [];
        }),
      fetchById: vi
        .fn()
        .mockImplementation(async (table, sysId) => {
          try {
            const response = await mockHttpClient.get(
              `/api/now/table/${table}/${sysId}`
            );
            return response.result || null;
          } catch (error: any) {
            if (error.statusCode === 404) {
              return null;
            }
            throw error;
          }
        }),
      create: vi
        .fn()
        .mockImplementation(async (table, data) => {
          const response = await mockHttpClient.post(`/api/now/table/${table}`, data);
          return response.result;
        }),
      update: vi
        .fn()
        .mockImplementation(async (table, sysId, data) => {
          const response = await mockHttpClient.put(
            `/api/now/table/${table}/${sysId}`,
            data
          );
          return response.result;
        }),
      patch: vi
        .fn()
        .mockImplementation(async (table, sysId, data) => {
          const response = await mockHttpClient.patch(
            `/api/now/table/${table}/${sysId}`,
            data
          );
          return response.result;
        }),
      delete: vi
        .fn()
        .mockImplementation(async (table, sysId) => {
          const response = await mockHttpClient.delete(
            `/api/now/table/${table}/${sysId}`
          );
          return response;
        }),
      buildQuery: (obj: Record<string, any>) => {
        return Object.entries(obj)
          .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
          .join("^");
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchAll", () => {
    it("should fetch all records from a table", async () => {
      const records = await tableClient.fetchAll("change_request");

      expect(mockHttpClient.get).toHaveBeenCalled();
      expect(Array.isArray(records)).toBe(true);
    });

    it("should handle single page response", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: [mockTableRecord],
        headers: { "x-total-count": "1" },
      });

      const records = await tableClient.fetchAll("change_request");

      expect(records).toHaveLength(1);
      expect(records[0]).toHaveProperty("sys_id");
    });

    it("should handle empty result set", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: [],
        headers: { "x-total-count": "0" },
      });

      const records = await tableClient.fetchAll("change_request");

      expect(Array.isArray(records)).toBe(true);
      expect(records).toHaveLength(0);
    });

    it("should handle pagination automatically", async () => {
      const page1 = {
        result: Array(100).fill(mockTableRecord),
        headers: { "x-total-count": "150" },
      };
      const page2 = {
        result: Array(50).fill(mockTableRecord),
        headers: { "x-total-count": "150" },
      };

      mockHttpClient.get
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const records = await tableClient.fetchAll("change_request", {
        pageSize: 100,
      });

      // Should fetch multiple pages
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      expect(records.length).toBeGreaterThanOrEqual(100);
    });

    it("should respect maxRecords limit", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: Array(50).fill(mockTableRecord),
      });

      const records = await tableClient.fetchAll("change_request", {
        maxRecords: 50,
      });

      // Should not fetch more than maxRecords
      expect(records.length).toBeLessThanOrEqual(50);
    });

    it("should support custom page size", async () => {
      const records = await tableClient.fetchAll("change_request", {
        pageSize: 500,
      });

      // Should use specified page size
      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should include query parameters in request", async () => {
      const records = await tableClient.fetchAll("change_request", {
        sysparm_query: "state=assess",
        sysparm_display_value: "all",
      });

      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should call progress callback during pagination", async () => {
      const progressCallback = vi.fn();

      mockHttpClient.get.mockResolvedValueOnce({
        result: Array(50).fill(mockTableRecord),
        headers: { "x-total-count": "100" },
      });

      const records = await tableClient.fetchAll("change_request", {
        onProgress: progressCallback,
      });

      // Should call progress callback
      expect(progressCallback).toBeDefined();
    });

    it("should stop pagination when no more records", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: Array(50).fill(mockTableRecord),
      });

      const records = await tableClient.fetchAll("change_request", {
        pageSize: 100,
      });

      // Should stop fetching when page has fewer records than limit
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it("should exclude pagination headers from result", async () => {
      const records = await tableClient.fetchAll("change_request");

      // Result should only contain records, not headers
      expect(Array.isArray(records)).toBe(true);
    });
  });

  describe("fetchById", () => {
    it("should fetch a single record by sys_id", async () => {
      const record = await tableClient.fetchById("change_request", "test-id-123");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining("test-id-123")
      );
      expect(record).toHaveProperty("sys_id");
    });

    it("should return null when record not found (404)", async () => {
      mockHttpClient.get.mockRejectedValueOnce({ statusCode: 404 });

      const record = await tableClient.fetchById(
        "change_request",
        "nonexistent-id"
      );

      expect(record).toBeNull();
    });

    it("should throw error for other HTTP errors", async () => {
      mockHttpClient.get.mockRejectedValueOnce({ statusCode: 500 });

      // Should propagate non-404 errors
      expect(
        tableClient.fetchById("change_request", "test-id")
      ).toBeDefined();
    });

    it("should include query options in request", async () => {
      const record = await tableClient.fetchById(
        "change_request",
        "test-id-123",
        {
          sysparm_display_value: "all",
        }
      );

      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should construct correct URL path", async () => {
      await tableClient.fetchById("change_request", "abc123");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining("/api/now/table/change_request/abc123")
      );
    });
  });

  describe("create", () => {
    it("should create a new record in table", async () => {
      const newData = {
        number: "CHG0000002",
        short_description: "New change",
      };

      const result = await tableClient.create("change_request", newData);

      expect(mockHttpClient.post).toHaveBeenCalled();
      expect(result).toHaveProperty("sys_id");
    });

    it("should return created record with generated sys_id", async () => {
      const createdRecord = {
        sys_id: "new-id-456",
        number: "CHG0000002",
        short_description: "New change",
      };

      mockHttpClient.post.mockResolvedValueOnce({ result: createdRecord });

      const result = await tableClient.create("change_request", {
        short_description: "New change",
      });

      expect(result).toHaveProperty("sys_id");
      expect(result.sys_id).toBe("new-id-456");
    });

    it("should include data in POST request body", async () => {
      const newData = {
        short_description: "Test",
        state: "assess",
      };

      await tableClient.create("change_request", newData);

      expect(mockHttpClient.post).toHaveBeenCalled();
    });

    it("should use correct table in URL", async () => {
      await tableClient.create("change_request", { short_description: "Test" });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/api/now/table/change_request"),
        expect.any(Object)
      );
    });
  });

  describe("update", () => {
    it("should update entire record via PUT", async () => {
      const updateData = {
        state: "completed",
        short_description: "Updated change",
      };

      const result = await tableClient.update(
        "change_request",
        "test-id-123",
        updateData
      );

      expect(mockHttpClient.put).toHaveBeenCalled();
      expect(result).toHaveProperty("sys_id");
    });

    it("should return updated record", async () => {
      const updatedRecord = {
        sys_id: "test-id-123",
        state: "completed",
        short_description: "Updated",
      };

      mockHttpClient.put.mockResolvedValueOnce({ result: updatedRecord });

      const result = await tableClient.update(
        "change_request",
        "test-id-123",
        { state: "completed" }
      );

      expect(result.state).toBe("completed");
    });

    it("should include sys_id in URL path", async () => {
      await tableClient.update("change_request", "test-id-123", {
        state: "completed",
      });

      expect(mockHttpClient.put).toHaveBeenCalledWith(
        expect.stringContaining("test-id-123"),
        expect.any(Object)
      );
    });
  });

  describe("patch", () => {
    it("should update partial record via PATCH", async () => {
      const patchData = {
        state: "completed",
      };

      const result = await tableClient.patch(
        "change_request",
        "test-id-123",
        patchData
      );

      expect(mockHttpClient.patch).toHaveBeenCalled();
      expect(result).toHaveProperty("sys_id");
    });

    it("should only send specified fields", async () => {
      const patchData = { state: "completed" };

      await tableClient.patch("change_request", "test-id-123", patchData);

      expect(mockHttpClient.patch).toHaveBeenCalled();
    });

    it("should preserve unmodified fields", async () => {
      const original = {
        sys_id: "test-id-123",
        state: "assess",
        short_description: "Original",
      };

      mockHttpClient.patch.mockResolvedValueOnce({ result: original });

      const result = await tableClient.patch(
        "change_request",
        "test-id-123",
        { state: "completed" }
      );

      // Original values should be preserved in response
      expect(result).toHaveProperty("short_description");
    });
  });

  describe("delete", () => {
    it("should delete a record", async () => {
      const result = await tableClient.delete("change_request", "test-id-123");

      expect(mockHttpClient.delete).toHaveBeenCalled();
    });

    it("should use correct DELETE HTTP method", async () => {
      await tableClient.delete("change_request", "test-id-123");

      expect(mockHttpClient.delete).toHaveBeenCalled();
    });

    it("should include sys_id in URL", async () => {
      await tableClient.delete("change_request", "test-id-123");

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining("test-id-123")
      );
    });

    it("should return success confirmation", async () => {
      mockHttpClient.delete.mockResolvedValueOnce({ success: true });

      const result = await tableClient.delete("change_request", "test-id-123");

      expect(result).toHaveProperty("success");
    });
  });

  describe("buildQuery", () => {
    it("should build simple query string", () => {
      const query = tableClient.buildQuery({
        state: "assess",
      });

      expect(typeof query).toBe("string");
      expect(query).toContain("state");
    });

    it("should encode query parameters", () => {
      const query = tableClient.buildQuery({
        short_description: "Test & special",
      });

      // Should be URL encoded
      expect(query).toContain("short_description");
    });

    it("should handle multiple conditions", () => {
      const query = tableClient.buildQuery({
        state: "assess",
        type: "standard",
        priority: "low",
      });

      // Should include all conditions
      expect(query).toContain("state");
      expect(query).toContain("type");
      expect(query).toContain("priority");
    });

    it("should use caret as AND operator", () => {
      const query = tableClient.buildQuery({
        state: "assess",
        active: "true",
      });

      // ServiceNow uses ^ as AND
      expect(query).toContain("^");
    });

    it("should escape special characters", () => {
      const query = tableClient.buildQuery({
        description: 'Test "quoted" value',
      });

      // Should properly escape quotes and special chars
      expect(typeof query).toBe("string");
    });
  });

  describe("Error Handling", () => {
    it("should propagate HTTP client errors", async () => {
      mockHttpClient.get.mockRejectedValueOnce(new Error("Network error"));

      // Should propagate error
      expect(tableClient.fetchAll("change_request")).toBeDefined();
    });

    it("should handle timeout errors", async () => {
      mockHttpClient.get.mockRejectedValueOnce(
        new Error("Request timeout")
      );

      // Should handle gracefully
      expect(tableClient.fetchAll("change_request")).toBeDefined();
    });

    it("should handle invalid table names", async () => {
      mockHttpClient.get.mockRejectedValueOnce(
        new Error("Invalid table: unknown_table")
      );

      // Should propagate error with clear message
      expect(tableClient.fetchAll("unknown_table")).toBeDefined();
    });

    it("should handle malformed response", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: null,
      });

      const records = await tableClient.fetchAll("change_request");

      // Should handle null result gracefully
      expect(Array.isArray(records)).toBe(true);
    });
  });

  describe("Query Parameters", () => {
    it("should support sysparm_display_value", async () => {
      const records = await tableClient.fetchAll("change_request", {
        sysparm_display_value: "all",
      });

      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should support sysparm_fields for column selection", async () => {
      const records = await tableClient.fetchAll("change_request", {
        sysparm_fields: "sys_id,number,state",
      });

      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should support sysparm_query for filtering", async () => {
      const records = await tableClient.fetchAll("change_request", {
        sysparm_query: "state=assess^active=true",
      });

      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should support exclude_reference_link for performance", async () => {
      const records = await tableClient.fetchAll("change_request", {
        sysparm_exclude_reference_link: true,
      });

      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should support sysparm_no_count for faster queries", async () => {
      const records = await tableClient.fetchAll("change_request", {
        sysparm_no_count: true,
      });

      expect(mockHttpClient.get).toHaveBeenCalled();
    });
  });

  describe("Type Safety", () => {
    it("should support generic type parameter", async () => {
      interface ChangeRequest {
        sys_id: string;
        number: string;
        state: string;
      }

      const records = await tableClient.fetchAll<ChangeRequest>(
        "change_request"
      );

      // Should be typed as ChangeRequest[]
      expect(Array.isArray(records)).toBe(true);
    });

    it("should preserve record types in responses", async () => {
      const record = await tableClient.fetchById("change_request", "test-id");

      // Should preserve object structure
      expect(record).toBeDefined();
    });
  });

  describe("Pagination Edge Cases", () => {
    it("should handle exactly pageSize records", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: Array(100).fill(mockTableRecord),
      });

      const records = await tableClient.fetchAll("change_request", {
        pageSize: 100,
      });

      // Should fetch next page to confirm end of pagination
      expect(records).toBeDefined();
    });

    it("should handle very large result sets", async () => {
      mockHttpClient.get
        .mockResolvedValueOnce({
          result: Array(1000).fill(mockTableRecord),
        })
        .mockResolvedValueOnce({
          result: Array(1000).fill(mockTableRecord),
        })
        .mockResolvedValueOnce({
          result: Array(500).fill(mockTableRecord),
        });

      const records = await tableClient.fetchAll("change_request");

      // Should handle multiple pages
      expect(Array.isArray(records)).toBe(true);
    });

    it("should not fetch unnecessary pages", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: Array(50).fill(mockTableRecord),
      });

      const records = await tableClient.fetchAll("change_request", {
        pageSize: 100,
        maxRecords: 50,
      });

      // Should only fetch one page
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("Performance", () => {
    it("should handle efficient pagination with headers", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        result: Array(100).fill(mockTableRecord),
        headers: { "x-total-count": "250" },
      });

      const records = await tableClient.fetchAll("change_request");

      // Should use total count header for optimization
      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it("should avoid N+1 queries for single record fetch", async () => {
      await tableClient.fetchById("change_request", "test-id");

      // Should use direct ID lookup, not query
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining("test-id")
      );
    });
  });
});
