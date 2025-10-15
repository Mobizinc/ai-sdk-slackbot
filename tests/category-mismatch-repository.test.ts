import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CategoryMismatchRepository, getCategoryMismatchRepository } from "../lib/db/repositories/category-mismatch-repository";
import { getDb } from "../lib/db/client";

// Mock dependencies
vi.mock("../lib/db/client");

describe("CategoryMismatchRepository", () => {
  let repository: CategoryMismatchRepository;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock database
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb);

    repository = new CategoryMismatchRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("logMismatch", () => {
    it("should log category mismatch successfully", async () => {
      // Arrange
      const mismatchData = {
        caseNumber: "CASE001",
        caseSysId: "sys_123",
        targetTable: "incident",
        aiSuggestedCategory: "Network",
        aiSuggestedSubcategory: "Outage",
        correctedCategory: "Hardware",
        confidenceScore: 0.9,
        caseDescription: "Network outage affecting multiple users",
      };

      const mockInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      await repository.logMismatch(mismatchData);

      // Assert
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          caseNumber: "CASE001",
          caseSysId: "sys_123",
          targetTable: "incident",
          aiSuggestedCategory: "Network",
          aiSuggestedSubcategory: "Outage",
          correctedCategory: "Hardware",
          confidenceScore: 0.9,
          caseDescription: "Network outage affecting multiple users",
          reviewed: false,
        })
      );
    });

    it("should use default target table when not provided", async () => {
      // Arrange
      const mismatchData = {
        caseNumber: "CASE001",
        aiSuggestedCategory: "Network",
        correctedCategory: "Hardware",
        confidenceScore: 0.9,
        caseDescription: "Network issue",
      };

      const mockInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      await repository.logMismatch(mismatchData);

      // Assert
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTable: "sn_customerservice_case",
        })
      );
    });

    it("should handle database errors gracefully", async () => {
      // Arrange
      const mismatchData = {
        caseNumber: "CASE001",
        aiSuggestedCategory: "Network",
        correctedCategory: "Hardware",
        confidenceScore: 0.9,
        caseDescription: "Network issue",
      };

      mockDb.insert.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      // Act & Assert - should not throw
      await expect(repository.logMismatch(mismatchData)).resolves.toBeUndefined();
    });

    it("should return early when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);

      const mismatchData = {
        caseNumber: "CASE001",
        aiSuggestedCategory: "Network",
        correctedCategory: "Hardware",
        confidenceScore: 0.9,
        caseDescription: "Network issue",
      };

      // Act
      await repository.logMismatch(mismatchData);

      // Assert
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe("getTopSuggestedCategories", () => {
    it("should retrieve top suggested categories", async () => {
      // Arrange
      const expectedCategories = [
        { category: "Network", count: 15, avgConfidence: 0.87 },
        { category: "Security", count: 12, avgConfidence: 0.82 },
        { category: "Application", count: 8, avgConfidence: 0.79 },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(expectedCategories),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getTopSuggestedCategories(30);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedCategories);
    });

    it("should return empty array when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);

      // Act
      const result = await repository.getTopSuggestedCategories(30);

      // Assert
      expect(result).toEqual([]);
    });

    it("should handle database errors gracefully", async () => {
      // Arrange
      mockDb.select.mockImplementation(() => {
        throw new Error("Database query failed");
      });

      // Act
      const result = await repository.getTopSuggestedCategories(30);

      // Assert
      expect(result).toEqual([]);
    });

    it("should use default days parameter", async () => {
      // Arrange
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      await repository.getTopSuggestedCategories();

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("getRecentMismatches", () => {
    it("should retrieve recent mismatches", async () => {
      // Arrange
      const expectedMismatches = [
        {
          id: 1,
          caseNumber: "CASE001",
          caseSysId: "sys_123",
          targetTable: "incident",
          aiSuggestedCategory: "Network",
          aiSuggestedSubcategory: "Outage",
          correctedCategory: "Hardware",
          confidenceScore: 0.9,
          caseDescription: "Network outage",
          reviewed: false,
          createdAt: new Date(),
        },
        {
          id: 2,
          caseNumber: "CASE002",
          caseSysId: "sys_456",
          targetTable: "sn_customerservice_case",
          aiSuggestedCategory: "Security",
          aiSuggestedSubcategory: "Breach",
          correctedCategory: "Software",
          confidenceScore: 0.85,
          caseDescription: "Security incident",
          reviewed: true,
          createdAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(expectedMismatches),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getRecentMismatches(50);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        caseNumber: "CASE001",
        aiSuggestedCategory: "Network",
        aiSuggestedSubcategory: "Outage",
        correctedCategory: "Hardware",
        confidenceScore: 0.9,
        caseDescription: "Network outage",
        createdAt: expectedMismatches[0].createdAt,
        reviewed: false,
      });
    });

    it("should handle undefined subcategory", async () => {
      // Arrange
      const expectedMismatches = [
        {
          id: 1,
          caseNumber: "CASE001",
          caseSysId: "sys_123",
          targetTable: "incident",
          aiSuggestedCategory: "Network",
          aiSuggestedSubcategory: null,
          correctedCategory: "Hardware",
          confidenceScore: 0.9,
          caseDescription: "Network issue",
          reviewed: false,
          createdAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(expectedMismatches),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getRecentMismatches(50);

      // Assert
      expect(result[0].aiSuggestedSubcategory).toBeUndefined();
    });

    it("should return empty array when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);

      // Act
      const result = await repository.getRecentMismatches(50);

      // Assert
      expect(result).toEqual([]);
    });

    it("should use default limit parameter", async () => {
      // Arrange
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      await repository.getRecentMismatches();

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockSelect.limit).toHaveBeenCalledWith(50);
    });
  });

  describe("getStatistics", () => {
    it("should return mismatch statistics", async () => {
      // Arrange
      const expectedStats = {
        totalMismatches: 25,
        uniqueCategories: 8,
        reviewedCount: 12,
        avgConfidence: 0.84,
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([expectedStats]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getStatistics(7);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedStats);
    });

    it("should return default stats when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);

      // Act
      const result = await repository.getStatistics(7);

      // Assert
      expect(result).toEqual({
        totalMismatches: 0,
        uniqueCategories: 0,
        reviewedCount: 0,
        avgConfidence: 0,
      });
    });

    it("should handle null average confidence", async () => {
      // Arrange
      const expectedStats = {
        totalMismatches: 10,
        uniqueCategories: 5,
        reviewedCount: 3,
        avgConfidence: null,
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([expectedStats]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getStatistics(7);

      // Assert
      expect(result.avgConfidence).toBe(0);
    });

    it("should use default days parameter", async () => {
      // Arrange
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          totalMismatches: 0,
          uniqueCategories: 0,
          reviewedCount: 0,
          avgConfidence: 0,
        }]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      await repository.getStatistics();

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      // Arrange
      mockDb.select.mockImplementation(() => {
        throw new Error("Database query failed");
      });

      // Act
      const result = await repository.getStatistics(7);

      // Assert
      expect(result).toEqual({
        totalMismatches: 0,
        uniqueCategories: 0,
        reviewedCount: 0,
        avgConfidence: 0,
      });
    });
  });

  describe("markAsReviewed", () => {
    it("should mark mismatch as reviewed successfully", async () => {
      // Arrange
      const id = 1;

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.update.mockReturnValue(mockUpdate);

      // Act
      await repository.markAsReviewed(id);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdate.set).toHaveBeenCalledWith({ reviewed: true });
    });

    it("should return early when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);
      const id = 1;

      // Act
      await repository.markAsReviewed(id);

      // Assert
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      // Arrange
      const id = 1;

      mockDb.update.mockImplementation(() => {
        throw new Error("Update failed");
      });

      // Act & Assert - should not throw
      await expect(repository.markAsReviewed(id)).resolves.toBeUndefined();
    });
  });
});

describe("getCategoryMismatchRepository", () => {
  it("should return singleton instance", () => {
    const repo1 = getCategoryMismatchRepository();
    const repo2 = getCategoryMismatchRepository();
    expect(repo1).toBe(repo2);
  });

  it("should return CategoryMismatchRepository instance", () => {
    const repo = getCategoryMismatchRepository();
    expect(repo).toBeInstanceOf(CategoryMismatchRepository);
  });
});