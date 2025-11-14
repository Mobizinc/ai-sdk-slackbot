import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MuscleMemoryRepository } from "../lib/db/repositories/muscle-memory-repository";
import { getDb } from "../lib/db/client";

// Mock the database client
vi.mock("../lib/db/client");
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  desc: vi.fn((value: unknown) => value),
  sql: vi.fn(),
}));

describe("MuscleMemoryRepository", () => {
  let repository: MuscleMemoryRepository;
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
    repository = new MuscleMemoryRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("saveExemplar", () => {
    it("should save a new exemplar with embedding", async () => {
      const testEmbedding = new Array(1536).fill(0.1);
      const inputData = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: { userRequest: "VPN connection issue" },
        actionTaken: { agentType: "ServiceNow", workNotes: ["Escalated to networking team"] },
        outcome: "success",
        embedding: testEmbedding,
        qualityScore: 0.85,
        qualitySignals: { supervisorApproval: true, outcomeSuccess: true },
      };

      const expectedId = "test-uuid-123";
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: expectedId }]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      const result = await repository.saveExemplar(inputData);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockInsert.values).toHaveBeenCalledWith(inputData);
      expect(result).toBe(expectedId);
    });

    it("should throw error when database is not available", async () => {
      vi.mocked(getDb).mockReturnValue(null);

      await expect(
        repository.saveExemplar({
          caseNumber: "SCS001",
          interactionType: "triage",
          inputContext: {},
          actionTaken: {},
          outcome: "success",
          embedding: [],
          qualityScore: 0.7,
          qualitySignals: {},
        })
      ).rejects.toThrow("Database not available");
    });
  });

  describe("findSimilarExemplars", () => {
    it("should find exemplars within similarity threshold", async () => {
      const testEmbedding = new Array(1536).fill(0.1);
      const mockResults = [
        {
          id: "exemplar-1",
          caseNumber: "SCS0123456",
          interactionType: "triage",
          summary: "VPN connectivity issue resolved",
          qualityScore: 0.9,
          distance: 0.15,
        },
        {
          id: "exemplar-2",
          caseNumber: "SCS0789012",
          interactionType: "triage",
          summary: "Network access problem fixed",
          qualityScore: 0.85,
          distance: 0.25,
        },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockResults),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const results = await repository.findSimilarExemplars(testEmbedding, {
        topK: 5,
        minQuality: 0.7,
        maxDistance: 0.5,
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
    });

    it("should filter by interaction type when provided", async () => {
      const testEmbedding = new Array(1536).fill(0.1);

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      await repository.findSimilarExemplars(testEmbedding, {
        interactionType: "kb_generation",
        topK: 3,
      });

      expect(mockSelect.where).toHaveBeenCalled();
    });
  });

  describe("findDuplicateExemplar", () => {
    it("should detect duplicates above 95% similarity threshold", async () => {
      const testEmbedding = new Array(1536).fill(0.1);
      const mockDuplicate = {
        id: "duplicate-exemplar",
        caseNumber: "SCS9999999",
        distance: 0.02, // Very similar (98%)
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockDuplicate]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await repository.findDuplicateExemplar(testEmbedding, "triage");

      expect(result).toEqual(mockDuplicate);
    });

    it("should return null when no duplicates found", async () => {
      const testEmbedding = new Array(1536).fill(0.1);

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await repository.findDuplicateExemplar(testEmbedding, "triage");

      expect(result).toBeNull();
    });
  });

  describe("quality signal tracking", () => {
    it("should save quality signals for an exemplar", async () => {
      const signalData = {
        exemplarId: "test-exemplar-id",
        signalType: "supervisor",
        signalValue: "approved",
        signalWeight: 0.4,
        signalMetadata: { reviewer: "auto" },
      };

      const mockInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      await repository.saveQualitySignal(signalData);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockInsert.values).toHaveBeenCalledWith(signalData);
    });

    it("should retrieve quality signals for an exemplar", async () => {
      const mockSignals = [
        {
          id: "signal-1",
          exemplarId: "test-exemplar",
          signalType: "supervisor",
          signalValue: "approved",
          signalWeight: 0.4,
          recordedAt: new Date(),
        },
        {
          id: "signal-2",
          exemplarId: "test-exemplar",
          signalType: "outcome",
          signalValue: "success",
          signalWeight: 0.2,
          recordedAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockSignals),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const results = await repository.getQualitySignals("test-exemplar");

      expect(results).toEqual(mockSignals);
      expect(results).toHaveLength(2);
    });
  });

  describe("updateExemplarQuality", () => {
    it("should update quality score and signals summary", async () => {
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.update.mockReturnValue(mockUpdate);

      await repository.updateExemplarQuality(
        "exemplar-123",
        0.92,
        { supervisorApproval: true, outcomeSuccess: true, humanFeedback: "positive" }
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdate.set).toHaveBeenCalledWith({
        qualityScore: 0.92,
        qualitySignals: { supervisorApproval: true, outcomeSuccess: true, humanFeedback: "positive" },
        updatedAt: expect.any(Date),
      });
    });
  });

  describe("analytics", () => {
    it("should get exemplar count by type", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 15 }]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const count = await repository.getExemplarCountByType("triage");

      expect(count).toBe(15);
    });

    it("should get distinct interaction types", async () => {
      const mockTypes = [
        { interactionType: "triage" },
        { interactionType: "kb_generation" },
        { interactionType: "connectivity" },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockTypes),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const types = await repository.getDistinctInteractionTypes();

      expect(types).toEqual(["triage", "kb_generation", "connectivity"]);
    });
  });
});
