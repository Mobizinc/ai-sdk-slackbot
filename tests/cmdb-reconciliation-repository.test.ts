import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CmdbReconciliationRepository } from "../lib/db/repositories/cmdb-reconciliation-repository";
import { getDb } from "../lib/db/client";
import { cmdbReconciliationResults } from "../lib/db/schema";
import { eq, desc } from "drizzle-orm";

// Mock the database client
vi.mock("../lib/db/client");
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn((value: unknown) => value),
}));
vi.mock("../lib/db/schema", () => ({
  cmdbReconciliationResults: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

describe("CmdbReconciliationRepository", () => {
  let repository: CmdbReconciliationRepository;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock database instance
    mockDb = {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
    };

    vi.mocked(getDb).mockReturnValue(mockDb);
    repository = new CmdbReconciliationRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("create", () => {
    it("should create a new reconciliation result", async () => {
      const inputData = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entityValue: "server01",
        entityType: "SYSTEM",
        originalEntityValue: "server01",
        reconciliationStatus: "matched" as const,
        confidence: 0.9,
      };

      const expectedOutput = {
        id: 1,
        ...inputData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedOutput]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      const result = await repository.create(inputData);

      expect(mockDb.insert).toHaveBeenCalledWith(cmdbReconciliationResults);
      expect(mockInsert.values).toHaveBeenCalledWith(inputData);
      expect(mockInsert.returning).toHaveBeenCalled();
      expect(result).toEqual(expectedOutput);
    });

    it("should throw error when database is not available", async () => {
      vi.mocked(getDb).mockReturnValue(null);

      await expect(repository.create({
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entityValue: "server01",
        entityType: "SYSTEM",
        originalEntityValue: "server01",
        reconciliationStatus: "matched",
        confidence: 0.9,
      })).rejects.toThrow("Database not available");
    });
  });

  describe("getByCaseNumber", () => {
    it("should get reconciliation results by case number", async () => {
      const caseNumber = "CASE001";
      const expectedResults = [
        { id: 1, caseNumber, entityValue: "server01" },
        { id: 2, caseNumber, entityValue: "192.168.1.1" },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(expectedResults),
      };

      mockDb.select.mockReturnValue(mockSelect);
      (eq as unknown as vi.Mock).mockReturnValue("mock_eq_condition");

      const result = await repository.getByCaseNumber(caseNumber);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockSelect.from).toHaveBeenCalledWith(cmdbReconciliationResults);
      expect(mockSelect.where).toHaveBeenCalledWith("mock_eq_condition");
      expect(eq).toHaveBeenCalledWith(cmdbReconciliationResults.caseNumber, caseNumber);
      expect(result).toEqual(expectedResults);
    });
  });

  describe("updateWithMatch", () => {
    it("should update reconciliation result with CMDB match information", async () => {
      const id = 1;
      const matchData = {
        cmdbSysId: "ci_sys_id_123",
        cmdbName: "server01",
        cmdbClass: "cmdb_ci_server",
        cmdbUrl: "http://servicenow.com/ci_sys_id_123",
        confidence: 0.9,
      };

      const expectedOutput = {
        id,
        ...matchData,
        reconciliationStatus: "matched" as const,
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedOutput]),
      };

      mockDb.update.mockReturnValue(mockUpdate);
      (eq as unknown as vi.Mock).mockReturnValue("mock_eq_condition");

      const result = await repository.updateWithMatch(id, matchData);

      expect(mockDb.update).toHaveBeenCalledWith(cmdbReconciliationResults);
      expect(mockUpdate.set).toHaveBeenCalledWith({
        ...matchData,
        reconciliationStatus: "matched",
        updatedAt: expect.any(Date),
      });
      expect(mockUpdate.where).toHaveBeenCalledWith("mock_eq_condition");
      expect(eq).toHaveBeenCalledWith(cmdbReconciliationResults.id, id);
      expect(result).toEqual(expectedOutput);
    });
  });

  describe("updateWithChildTask", () => {
    it("should update reconciliation result with child task information", async () => {
      const id = 1;
      const taskData = {
        childTaskNumber: "TASK001",
        childTaskSysId: "task_sys_id_123",
      };

      const expectedOutput = {
        id,
        ...taskData,
        reconciliationStatus: "unmatched" as const,
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedOutput]),
      };

      mockDb.update.mockReturnValue(mockUpdate);
      (eq as unknown as vi.Mock).mockReturnValue("mock_eq_condition");

      const result = await repository.updateWithChildTask(id, taskData);

      expect(mockUpdate.set).toHaveBeenCalledWith({
        ...taskData,
        reconciliationStatus: "unmatched",
        updatedAt: expect.any(Date),
      });
      expect(result).toEqual(expectedOutput);
    });
  });

  describe("markAsSkipped", () => {
    it("should mark reconciliation result as skipped", async () => {
      const id = 1;
      const reason = "Unresolved alias";

      const expectedOutput = {
        id,
        reconciliationStatus: "skipped" as const,
        errorMessage: reason,
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedOutput]),
      };

      mockDb.update.mockReturnValue(mockUpdate);
      (eq as unknown as vi.Mock).mockReturnValue("mock_eq_condition");

      const result = await repository.markAsSkipped(id, reason);

      expect(mockUpdate.set).toHaveBeenCalledWith({
        reconciliationStatus: "skipped",
        errorMessage: reason,
        updatedAt: expect.any(Date),
      });
      expect(result).toEqual(expectedOutput);
    });
  });

  describe("markAsAmbiguous", () => {
    it("should mark reconciliation result as ambiguous", async () => {
      const id = 1;
      const details = "Found 2 matches";

      const expectedOutput = {
        id,
        reconciliationStatus: "ambiguous" as const,
        errorMessage: details,
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedOutput]),
      };

      mockDb.update.mockReturnValue(mockUpdate);
      (eq as unknown as vi.Mock).mockReturnValue("mock_eq_condition");

      const result = await repository.markAsAmbiguous(id, details);

      expect(mockUpdate.set).toHaveBeenCalledWith({
        reconciliationStatus: "ambiguous",
        errorMessage: details,
        updatedAt: expect.any(Date),
      });
      expect(result).toEqual(expectedOutput);
    });
  });

  describe("getCaseStatistics", () => {
    it("should calculate reconciliation statistics for a case", async () => {
      const caseNumber = "CASE001";
      const mockResults = [
        { reconciliationStatus: "matched" },
        { reconciliationStatus: "matched" },
        { reconciliationStatus: "unmatched" },
        { reconciliationStatus: "skipped" },
        { reconciliationStatus: "ambiguous" },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockResults),
      };

      mockDb.select.mockReturnValue(mockSelect);
      (eq as unknown as vi.Mock).mockReturnValue("mock_eq_condition");

      const result = await repository.getCaseStatistics(caseNumber);

      expect(result).toEqual({
        total: 5,
        matched: 2,
        unmatched: 1,
        skipped: 1,
        ambiguous: 1,
      });
    });
  });

  describe("getRecent", () => {
    it("should get recent reconciliation results", async () => {
      const limit = 50;
      const expectedResults = [
        { id: 1, caseNumber: "CASE001" },
        { id: 2, caseNumber: "CASE002" },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(expectedResults),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await repository.getRecent(limit);

      expect(mockSelect.limit).toHaveBeenCalledWith(limit);
      expect(result).toEqual(expectedResults);
    });
  });

  describe("getUnmatchedEntities", () => {
    it("should get unmatched entities", async () => {
      const limit = 20;
      const expectedResults = [
        { id: 1, entityValue: "missing-server1", reconciliationStatus: "unmatched" },
        { id: 2, entityValue: "missing-server2", reconciliationStatus: "unmatched" },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(expectedResults),
      };

      mockDb.select.mockReturnValue(mockSelect);
      vi.mocked(eq).mockReturnValue("mock_eq_condition");

      const result = await repository.getUnmatchedEntities(limit);

      expect(mockSelect.where).toHaveBeenCalledWith("mock_eq_condition");
      expect(eq).toHaveBeenCalledWith(cmdbReconciliationResults.reconciliationStatus, "unmatched");
      expect(mockSelect.limit).toHaveBeenCalledWith(limit);
      expect(result).toEqual(expectedResults);
    });
  });
});
