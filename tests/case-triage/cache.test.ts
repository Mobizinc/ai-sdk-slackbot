/**
 * Unit Tests for Case Triage Cache Module
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TriageCache } from "../../lib/services/case-triage/cache";
import type { CaseClassificationRepository } from "../../lib/services/case-triage/storage";
import type { CacheKey } from "../../lib/services/case-triage/types";

describe("TriageCache", () => {
  let cache: TriageCache;
  let mockRepository: CaseClassificationRepository;

  beforeEach(() => {
    mockRepository = {
      saveInboundPayload: vi.fn(),
      getUnprocessedPayload: vi.fn(),
      markPayloadAsProcessed: vi.fn(),
      saveClassificationResult: vi.fn(),
      saveDiscoveredEntities: vi.fn(),
      getLatestClassificationResult: vi.fn(),
      getClassificationStats: vi.fn(),
    };

    cache = new TriageCache(mockRepository);
  });

  describe("checkIdempotency() - Layer 1", () => {
    it("should return cache MISS if no previous classification exists", async () => {
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue(null);

      const result = await cache.checkIdempotency("SCS0012345", 5);

      expect(result.hit).toBe(false);
      expect(result.data).toBeUndefined();
    });

    it("should return cache MISS if classification is too old", async () => {
      const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: { category: "Network", sys_id: "abc123" },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 3,
        createdAt: oldDate,
      });

      const result = await cache.checkIdempotency("SCS0012345", 5);

      expect(result.hit).toBe(false);
    });

    it("should return cache HIT if classification is recent", async () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: {
          category: "Network",
          sys_id: "abc123",
          similar_cases: [],
          kb_articles: [],
          record_type_suggestion: { type: "Incident", reasoning: "Test" },
        },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 3,
        createdAt: recentDate,
      });

      const result = await cache.checkIdempotency("SCS0012345", 5);

      expect(result.hit).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.caseNumber).toBe("SCS0012345");
      expect(result.data?.cached).toBe(true);
      expect(result.age).toBeCloseTo(2, 0); // ~2 minutes
      expect(result.reason).toContain("Recent classification");
    });

    it("should calculate age correctly in seconds", async () => {
      const date30SecondsAgo = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: { category: "Network", sys_id: "abc123" },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 0,
        createdAt: date30SecondsAgo,
      });

      const result = await cache.checkIdempotency("SCS0012345", 5);

      expect(result.hit).toBe(true);
      expect(result.age).toBeCloseTo(0.5, 1); // ~0.5 minutes (30 seconds)
    });

    it("should handle DB errors gracefully", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockRepository.getLatestClassificationResult = vi.fn().mockRejectedValue(new Error("DB error"));

      const result = await cache.checkIdempotency("SCS0012345", 5);

      expect(result.hit).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Case Triage Cache] Error checking idempotency:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should preserve all classification data in cache hit", async () => {
      const recentDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: {
          category: "Network",
          subcategory: "Wi-Fi",
          confidence_score: 0.92,
          sys_id: "abc123",
          similar_cases: [{ case_number: "SCS0011111", score: 0.85 }],
          kb_articles: [{ article_number: "KB001", title: "Test" }],
        },
        servicenowUpdated: true,
        processingTimeMs: 2500,
        entitiesCount: 5,
        createdAt: recentDate,
      });

      const result = await cache.checkIdempotency("SCS0012345", 5);

      expect(result.hit).toBe(true);
      expect(result.data?.classification.category).toBe("Network");
      expect(result.data?.classification.subcategory).toBe("Wi-Fi");
      expect(result.data?.similarCases).toHaveLength(1);
      expect(result.data?.kbArticles).toHaveLength(1);
      expect(result.data?.entitiesDiscovered).toBe(5);
    });
  });

  describe("checkWorkflowCache() - Layer 2", () => {
    const cacheKey: CacheKey = {
      caseNumber: "SCS0012345",
      workflowId: "standard",
      assignmentGroup: "IT Support",
    };

    it("should return cache MISS if no previous classification", async () => {
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue(null);

      const result = await cache.checkWorkflowCache(cacheKey);

      expect(result.hit).toBe(false);
    });

    it("should return cache MISS if workflow changed", async () => {
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "expedited", // Different workflow
        classificationJson: { category: "Network" },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 0,
        createdAt: new Date(),
      });

      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await cache.checkWorkflowCache(cacheKey);

      expect(result.hit).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Workflow changed: expedited → standard")
      );

      consoleLogSpy.mockRestore();
    });

    it("should return cache MISS if assignment group changed", async () => {
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: {
          category: "Network",
          assignment_group: "Network Team", // Different assignment
        },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 0,
        createdAt: new Date(),
      });

      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await cache.checkWorkflowCache(cacheKey);

      expect(result.hit).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Assignment group changed: Network Team → IT Support")
      );

      consoleLogSpy.mockRestore();
    });

    it("should return cache HIT if workflow and assignment unchanged", async () => {
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: {
          category: "Network",
          assignment_group: "IT Support",
          sys_id: "abc123",
          similar_cases: [],
          kb_articles: [],
          record_type_suggestion: { type: "Incident" },
        },
        servicenowUpdated: true,
        processingTimeMs: 2500,
        entitiesCount: 3,
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago (beyond idempotency)
      });

      const result = await cache.checkWorkflowCache(cacheKey);

      expect(result.hit).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.workflowId).toBe("standard");
      expect(result.data?.cached).toBe(true);
      expect(result.reason).toBe("Previous classification found for same case + workflow + assignment");
    });

    it("should handle null assignment group", async () => {
      const keyNoAssignment: CacheKey = {
        caseNumber: "SCS0012345",
        workflowId: "standard",
        assignmentGroup: null,
      };

      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: { category: "Network", sys_id: "abc123" },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 0,
        createdAt: new Date(),
      });

      const result = await cache.checkWorkflowCache(keyNoAssignment);

      expect(result.hit).toBe(true); // No assignment comparison, just workflow match
    });

    it("should handle DB errors gracefully", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockRepository.getLatestClassificationResult = vi.fn().mockRejectedValue(new Error("DB error"));

      const result = await cache.checkWorkflowCache(cacheKey);

      expect(result.hit).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should set incident/problem creation flags to false in cached results", async () => {
      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: {
          category: "Network",
          assignment_group: "IT Support",
          sys_id: "abc123",
          record_type_suggestion: { type: "Incident", is_major_incident: true },
        },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 0,
        createdAt: new Date(),
      });

      const result = await cache.checkWorkflowCache(cacheKey);

      expect(result.hit).toBe(true);
      // Cached results should NOT trigger new incident creation
      expect(result.data?.incidentCreated).toBe(false);
      expect(result.data?.problemCreated).toBe(false);
      expect(result.data?.catalogRedirected).toBe(false);
    });
  });

  describe("Two-Layer Integration", () => {
    it("should use idempotency for very recent classifications", async () => {
      const veryRecent = new Date(Date.now() - 30 * 1000); // 30 seconds ago

      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: { category: "Network", sys_id: "abc123" },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 0,
        createdAt: veryRecent,
      });

      const idempotencyResult = await cache.checkIdempotency("SCS0012345", 5);

      expect(idempotencyResult.hit).toBe(true);
      expect(idempotencyResult.reason).toContain("Recent classification");
    });

    it("should use workflow cache for older classifications with same routing", async () => {
      const olderDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago (beyond idempotency)

      mockRepository.getLatestClassificationResult = vi.fn().mockResolvedValue({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: {
          category: "Network",
          assignment_group: "IT Support",
          sys_id: "abc123",
        },
        servicenowUpdated: true,
        processingTimeMs: 2000,
        entitiesCount: 0,
        createdAt: olderDate,
      });

      // Idempotency should miss (too old)
      const idempotencyResult = await cache.checkIdempotency("SCS0012345", 5);
      expect(idempotencyResult.hit).toBe(false);

      // But workflow cache should hit
      const workflowResult = await cache.checkWorkflowCache({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        assignmentGroup: "IT Support",
      });
      expect(workflowResult.hit).toBe(true);
      expect(workflowResult.reason).toContain("same case + workflow + assignment");
    });
  });
});
