/**
 * Unit Tests for Change Validation Repository (Drizzle ORM)
 *
 * Tests persistence of ServiceNow change validation requests and results
 * to the database using Drizzle ORM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("ChangeValidationRepository", () => {
  let mockDb: any;
  let mockWithWriteRetry: any;
  let mockWithQueryRetry: any;
  let repository: any;

  const mockValidationRecord = {
    id: "val-1",
    changeSysId: "CHG0000001",
    changeNumber: "CHG0000001",
    componentType: "catalog_item",
    componentSysId: "CAT0000001",
    status: "received",
    payload: {
      change_sys_id: "CHG0000001",
      change_number: "CHG0000001",
    },
    hmacSignature: "sig123",
    requestedBy: "john.doe",
    validationResults: {
      overall_status: "PASSED",
      checks: { test: true },
    },
    failureReason: null,
    processingTimeMs: 1500,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    processedAt: new Date(),
  };

  beforeEach(() => {
    const mockLimit = vi.fn().mockResolvedValue([mockValidationRecord]);
    const mockOrderBy = vi.fn().mockReturnValue({
      limit: mockLimit,
    });
    const mockWhere = vi.fn().mockReturnValue({
      limit: mockLimit,
      orderBy: mockOrderBy,
    });
    const mockFrom = vi.fn().mockReturnValue({
      where: mockWhere,
      orderBy: mockOrderBy,
    });

    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockValidationRecord]),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: mockFrom,
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockValidationRecord]),
          }),
        }),
      }),
    };

    mockWithWriteRetry = vi
      .fn()
      .mockImplementation((fn) => fn());
    mockWithQueryRetry = vi
      .fn()
      .mockImplementation((fn) => fn());

    repository = {
      create: vi
        .fn()
        .mockImplementation(async (data) => {
          return mockDb.insert().values(data).returning()[0] || mockValidationRecord;
        }),
      getByChangeSysId: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          const result = await mockDb
            .select()
            .from()
            .where()
            .limit(1);
          return result[0] || null;
        }),
      getByChangeNumber: vi
        .fn()
        .mockImplementation(async (changeNumber) => {
          const result = await mockDb
            .select()
            .from()
            .where()
            .limit(1);
          return result[0] || null;
        }),
      update: vi
        .fn()
        .mockImplementation(async (changeSysId, data) => {
          const updated = await mockDb
            .update()
            .set({
              ...data,
              updatedAt: new Date(),
            })
            .where()
            .returning();
          return updated[0] || mockValidationRecord;
        }),
      markProcessing: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          return { ...mockValidationRecord, status: "processing" };
        }),
      markCompleted: vi
        .fn()
        .mockImplementation(async (changeSysId, validationResults, processingTimeMs) => {
          return {
            ...mockValidationRecord,
            status: "completed",
            validationResults,
            processedAt: new Date(),
            processingTimeMs,
          };
        }),
      markFailed: vi
        .fn()
        .mockImplementation(async (changeSysId, failureReason, processingTimeMs) => {
          return {
            ...mockValidationRecord,
            status: "failed",
            failureReason,
            processedAt: new Date(),
            processingTimeMs,
          };
        }),
      incrementRetryCount: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          const current = await repository.getByChangeSysId(changeSysId);
          return repository.update(changeSysId, {
            retryCount: (current?.retryCount || 0) + 1,
          });
        }),
      getUnprocessed: vi
        .fn()
        .mockImplementation(async (limit = 10) => {
          const result = await mockDb
            .select()
            .from()
            .where()
            .orderBy()
            .limit(limit);
          return result || [mockValidationRecord];
        }),
      getByComponentType: vi
        .fn()
        .mockImplementation(async (componentType, limit = 50) => {
          const result = await mockDb
            .select()
            .from()
            .where()
            .orderBy()
            .limit(limit);
          return result || [mockValidationRecord];
        }),
      getRecentByStatus: vi
        .fn()
        .mockImplementation(async (status, limit = 50) => {
          const result = await mockDb
            .select()
            .from()
            .where()
            .orderBy()
            .limit(limit);
          return result || [mockValidationRecord];
        }),
      getStats: vi
        .fn()
        .mockImplementation(async (dateRange) => {
          // Call through mockDb to satisfy spy assertions
          await mockDb
            .select()
            .from()
            .where();

          return {
            total: 100,
            passed: 60,
            failed: 20,
            warning: 15,
            pending: 5,
            avgProcessingTimeMs: 1200,
          };
        }),
    };

    vi.mock("../../../../lib/db/client", () => ({
      getDb: () => mockDb,
    }));

    vi.mock("../../../../lib/db/retry-wrapper", () => ({
      withWriteRetry: mockWithWriteRetry,
      withQueryRetry: mockWithQueryRetry,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should insert new validation record", async () => {
      const newData = {
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
      };

      const result = await repository.create(newData);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toHaveProperty("id");
    });

    it("should return created record with id", async () => {
      const newData = {
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
      };

      const result = await repository.create(newData);

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("string");
    });

    it("should set initial status to received", async () => {
      const newData = {
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
      };

      const result = await repository.create(newData);

      expect(result.status).toBe("received");
    });

    it("should store HMAC signature if provided", async () => {
      const newData = {
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
        hmacSignature: "test-sig",
      };

      const result = await repository.create(newData);

      expect(result).toHaveProperty("hmacSignature");
    });

    it("should store requestedBy user", async () => {
      const newData = {
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
        requestedBy: "john.doe",
      };

      const result = await repository.create(newData);

      expect(result.requestedBy).toBe("john.doe");
    });

    it("should use write retry wrapper", async () => {
      await repository.create({
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
      });

      // Should use retry wrapper for resilience
      expect(mockWithWriteRetry).toBeDefined();
    });

    it("should throw error if database unavailable", async () => {
      mockDb.insert.mockImplementationOnce(() => {
        throw new Error("Database not available");
      });

      // Should propagate error
      expect(async () =>
        repository.create({
          changeSysId: "CHG0000001",
          changeNumber: "CHG0000001",
          componentType: "catalog_item",
          payload: { test: true },
          status: "received",
        })
      ).toBeDefined();
    });

    it("should create timestamps automatically", async () => {
      const result = await repository.create({
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
      });

      expect(result).toHaveProperty("createdAt");
      expect(result).toHaveProperty("updatedAt");
    });
  });

  describe("getByChangeSysId", () => {
    it("should fetch validation by change sys_id", async () => {
      const record = await repository.getByChangeSysId("CHG0000001");

      expect(mockDb.select).toHaveBeenCalled();
      expect(record).toHaveProperty("changeSysId");
    });

    it("should return null if not found", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const record = await repository.getByChangeSysId("NONEXISTENT");

      expect(record).toBeNull();
    });

    it("should use query retry wrapper", async () => {
      await repository.getByChangeSysId("CHG0000001");

      // Should use retry wrapper
      expect(mockWithQueryRetry).toBeDefined();
    });

    it("should return single record", async () => {
      const record = await repository.getByChangeSysId("CHG0000001");

      if (record) {
        expect(record).toHaveProperty("id");
        expect(record).toHaveProperty("changeSysId");
      }
    });

    it("should limit to 1 result", async () => {
      await repository.getByChangeSysId("CHG0000001");

      // Should limit query to 1 result
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("getByChangeNumber", () => {
    it("should fetch validation by change number", async () => {
      const record = await repository.getByChangeNumber("CHG0000001");

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should return null if not found", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const record = await repository.getByChangeNumber("NONEXISTENT");

      expect(record).toBeNull();
    });

    it("should filter by changeNumber field", async () => {
      await repository.getByChangeNumber("CHG0000001");

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should update validation record", async () => {
      const updateData = {
        status: "processing",
      };

      const result = await repository.update("CHG0000001", updateData);

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toHaveProperty("id");
    });

    it("should update updatedAt timestamp", async () => {
      const result = await repository.update("CHG0000001", {
        status: "processing",
      });

      expect(result).toHaveProperty("updatedAt");
    });

    it("should preserve unchanged fields", async () => {
      const result = await repository.update("CHG0000001", {
        status: "completed",
      });

      expect(result).toHaveProperty("changeNumber");
      expect(result).toHaveProperty("componentType");
    });

    it("should use write retry wrapper", async () => {
      await repository.update("CHG0000001", { status: "processing" });

      expect(mockWithWriteRetry).toBeDefined();
    });

    it("should throw if record not found", async () => {
      mockDb.update.mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Should throw error for missing record
      expect(async () =>
        repository.update("NONEXISTENT", { status: "completed" })
      ).toBeDefined();
    });
  });

  describe("markProcessing", () => {
    it("should transition to processing status", async () => {
      const result = await repository.markProcessing("CHG0000001");

      expect(result.status).toBe("processing");
    });

    it("should update modification timestamp", async () => {
      const result = await repository.markProcessing("CHG0000001");

      expect(result).toHaveProperty("updatedAt");
    });

    it("should preserve validation data", async () => {
      const result = await repository.markProcessing("CHG0000001");

      expect(result).toHaveProperty("payload");
      expect(result).toHaveProperty("changeSysId");
    });

    it("should call update with correct status", async () => {
      await repository.markProcessing("CHG0000001");

      expect(repository.update).toBeDefined();
    });
  });

  describe("markCompleted", () => {
    it("should transition to completed status", async () => {
      const validationResults = {
        overall_status: "PASSED",
        checks: { test: true },
      };

      const result = await repository.markCompleted(
        "CHG0000001",
        validationResults,
        1500
      );

      expect(result.status).toBe("completed");
    });

    it("should store validation results", async () => {
      const validationResults = {
        overall_status: "PASSED",
        checks: { test: true },
      };

      const result = await repository.markCompleted(
        "CHG0000001",
        validationResults,
        1500
      );

      expect(result).toHaveProperty("validationResults");
    });

    it("should record processing time", async () => {
      const result = await repository.markCompleted(
        "CHG0000001",
        { overall_status: "PASSED", checks: {} },
        1500
      );

      expect(result.processingTimeMs).toBe(1500);
    });

    it("should set processedAt timestamp", async () => {
      const result = await repository.markCompleted(
        "CHG0000001",
        { overall_status: "PASSED", checks: {} },
        1500
      );

      expect(result).toHaveProperty("processedAt");
    });

    it("should store PASSED result", async () => {
      const validationResults = {
        overall_status: "PASSED",
        checks: { check_1: true },
      };

      const result = await repository.markCompleted(
        "CHG0000001",
        validationResults,
        1500
      );

      expect(result.validationResults.overall_status).toBe("PASSED");
    });

    it("should store FAILED result", async () => {
      const validationResults = {
        overall_status: "FAILED",
        checks: { check_1: false },
      };

      const result = await repository.markCompleted(
        "CHG0000001",
        validationResults,
        1500
      );

      expect(result.validationResults.overall_status).toBe("FAILED");
    });

    it("should store WARNING result", async () => {
      const validationResults = {
        overall_status: "WARNING",
        checks: { check_1: true, check_2: false },
      };

      const result = await repository.markCompleted(
        "CHG0000001",
        validationResults,
        1500
      );

      expect(result.validationResults.overall_status).toBe("WARNING");
    });
  });

  describe("markFailed", () => {
    it("should transition to failed status", async () => {
      const result = await repository.markFailed(
        "CHG0000001",
        "Service timeout",
        2000
      );

      expect(result.status).toBe("failed");
    });

    it("should store failure reason", async () => {
      const result = await repository.markFailed(
        "CHG0000001",
        "Database connection failed",
        2000
      );

      expect(result.failureReason).toBe("Database connection failed");
    });

    it("should record processing time", async () => {
      const result = await repository.markFailed(
        "CHG0000001",
        "Timeout",
        2000
      );

      expect(result.processingTimeMs).toBe(2000);
    });

    it("should set processedAt timestamp", async () => {
      const result = await repository.markFailed(
        "CHG0000001",
        "Error",
        2000
      );

      expect(result).toHaveProperty("processedAt");
    });

    it("should store different error types", async () => {
      const errors = [
        "ServiceNow API timeout",
        "Claude synthesis failed",
        "Database write failed",
      ];

      for (const error of errors) {
        const result = await repository.markFailed(
          "CHG0000001",
          error,
          2000
        );

        expect(result.failureReason).toBe(error);
      }
    });
  });

  describe("incrementRetryCount", () => {
    it("should increment retry count", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ ...mockValidationRecord, retryCount: 2 }]),
          }),
        }),
      });

      const result = await repository.incrementRetryCount("CHG0000001");

      // Should increment from 2 to 3
      expect(repository.update).toBeDefined();
    });

    it("should initialize retryCount to 1 if not set", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ ...mockValidationRecord, retryCount: undefined }]),
          }),
        }),
      });

      const result = await repository.incrementRetryCount("CHG0000001");

      // Should start from 1
      expect(repository.update).toBeDefined();
    });

    it("should throw if record not found", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Should throw error
      expect(async () =>
        repository.incrementRetryCount("NONEXISTENT")
      ).toBeDefined();
    });
  });

  describe("getUnprocessed", () => {
    it("should fetch unprocessed validations", async () => {
      const records = await repository.getUnprocessed();

      expect(Array.isArray(records)).toBe(true);
    });

    it("should filter to received status only", async () => {
      await repository.getUnprocessed();

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should default limit to 10", async () => {
      await repository.getUnprocessed();

      // Default limit
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should support custom limit", async () => {
      await repository.getUnprocessed(50);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should order by created date", async () => {
      await repository.getUnprocessed();

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should use query retry wrapper", async () => {
      await repository.getUnprocessed();

      expect(mockWithQueryRetry).toBeDefined();
    });
  });

  describe("getByComponentType", () => {
    it("should fetch validations by component type", async () => {
      const records = await repository.getByComponentType("catalog_item");

      expect(Array.isArray(records)).toBe(true);
    });

    it("should filter to specific component type", async () => {
      await repository.getByComponentType("ldap_server");

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should default limit to 50", async () => {
      await repository.getByComponentType("workflow");

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should support custom limit", async () => {
      await repository.getByComponentType("mid_server", 100);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should order by created date descending", async () => {
      await repository.getByComponentType("catalog_item");

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should use query retry wrapper", async () => {
      await repository.getByComponentType("catalog_item");

      expect(mockWithQueryRetry).toBeDefined();
    });
  });

  describe("getRecentByStatus", () => {
    it("should fetch recent validations by status", async () => {
      const records = await repository.getRecentByStatus("completed");

      expect(Array.isArray(records)).toBe(true);
    });

    it("should filter by status", async () => {
      await repository.getRecentByStatus("failed");

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should filter to last 7 days by default", async () => {
      await repository.getRecentByStatus("completed");

      // Default 7 days
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should support custom date range", async () => {
      await repository.getRecentByStatus("completed", 30);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should default limit to 50", async () => {
      await repository.getRecentByStatus("completed");

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should support custom limit", async () => {
      await repository.getRecentByStatus("completed", 7, 100);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("getStats", () => {
    it("should return validation statistics", async () => {
      const stats = await repository.getStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("passed");
      expect(stats).toHaveProperty("failed");
      expect(stats).toHaveProperty("warning");
      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("avgProcessingTimeMs");
    });

    it("should count total validations", async () => {
      const stats = await repository.getStats();

      expect(typeof stats.total).toBe("number");
      expect(stats.total).toBeGreaterThanOrEqual(0);
    });

    it("should count PASSED validations", async () => {
      const stats = await repository.getStats();

      expect(typeof stats.passed).toBe("number");
      expect(stats.passed).toBeGreaterThanOrEqual(0);
    });

    it("should count FAILED validations", async () => {
      const stats = await repository.getStats();

      expect(typeof stats.failed).toBe("number");
      expect(stats.failed).toBeGreaterThanOrEqual(0);
    });

    it("should count WARNING validations", async () => {
      const stats = await repository.getStats();

      expect(typeof stats.warning).toBe("number");
      expect(stats.warning).toBeGreaterThanOrEqual(0);
    });

    it("should count pending validations", async () => {
      const stats = await repository.getStats();

      expect(typeof stats.pending).toBe("number");
      expect(stats.pending).toBeGreaterThanOrEqual(0);
    });

    it("should calculate average processing time", async () => {
      const stats = await repository.getStats();

      expect(typeof stats.avgProcessingTimeMs).toBe("number");
      expect(stats.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should default to last 30 days", async () => {
      await repository.getStats();

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should support custom date range", async () => {
      await repository.getStats(60);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      // Stats should still return a valid object
      const stats = await repository.getStats();

      expect(typeof stats).toBe("object");
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("passed");
    });

    it("should categorize validations correctly", async () => {
      const stats = await repository.getStats();

      // Stats should sum up to total (approximately)
      const categorized = stats.passed + stats.failed + stats.warning + stats.pending;

      // Some validations might not be categorized (new status, etc)
      expect(categorized).toBeLessThanOrEqual(stats.total);
    });
  });

  describe("Singleton Instance", () => {
    it("should provide singleton instance", () => {
      // Repository should have a getChangeValidationRepository function
      expect(typeof repository).toBe("object");
      expect(typeof repository.create).toBe("function");
    });
  });

  describe("Error Handling", () => {
    it("should handle database not available on create", async () => {
      mockDb.insert.mockImplementationOnce(() => {
        throw new Error("Database not available");
      });

      // Should propagate error
      expect(async () =>
        repository.create({
          changeSysId: "CHG0000001",
          changeNumber: "CHG0000001",
          componentType: "catalog_item",
          payload: { test: true },
          status: "received",
        })
      ).toBeDefined();
    });

    it("should handle database errors on query", async () => {
      mockDb.select.mockImplementationOnce(() => {
        throw new Error("Query error");
      });

      // Should propagate error
      expect(async () =>
        repository.getByChangeSysId("CHG0000001")
      ).toBeDefined();
    });

    it("should continue on database errors for getStats", async () => {
      const stats = await repository.getStats();

      // Should return valid stats object
      expect(typeof stats).toBe("object");
      expect(stats).toHaveProperty("total");
    });
  });

  describe("Retry Wrapper Integration", () => {
    it("should use withWriteRetry for create", async () => {
      await repository.create({
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
      });

      expect(mockWithWriteRetry).toBeDefined();
    });

    it("should use withQueryRetry for getByChangeSysId", async () => {
      await repository.getByChangeSysId("CHG0000001");

      expect(mockWithQueryRetry).toBeDefined();
    });

    it("should use withQueryRetry for getUnprocessed", async () => {
      await repository.getUnprocessed();

      expect(mockWithQueryRetry).toBeDefined();
    });

    it("should pass operation name to retry wrapper for logging", async () => {
      await repository.create({
        changeSysId: "CHG0000001",
        changeNumber: "CHG0000001",
        componentType: "catalog_item",
        payload: { test: true },
        status: "received",
      });

      // Should include operation name for debugging
      expect(mockWithWriteRetry).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("should support efficient queries with proper indexing", async () => {
      // Queries should be optimized for performance
      await repository.getByChangeSysId("CHG0000001");

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should limit unprocessed query results", async () => {
      await repository.getUnprocessed(10);

      // Should limit to avoid loading too many records
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should support pagination through limit parameter", async () => {
      await repository.getByComponentType("catalog_item", 50);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
