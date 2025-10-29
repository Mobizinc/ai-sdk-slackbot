/**
 * Performance and Caching Tests
 * Tests for caching mechanisms, performance optimizations, and resource management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssignmentGroupCache } from "../lib/services/assignment-group-cache";
import { InteractiveStateManager } from "../lib/services/interactive-state-manager";

// Mock ServiceNow repository
vi.mock("../lib/infrastructure/servicenow/repositories", () => ({
  getAssignmentGroupRepository: () => ({
    findAll: vi.fn()
  })
}));

// Mock database
vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "test-id" }]))
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve())
    }))
  }
}));

describe("Performance and Caching", () => {
  describe("AssignmentGroupCache Performance", () => {
    let cache: AssignmentGroupCache;
    let mockRepository: any;

    beforeEach(() => {
      cache = new AssignmentGroupCache();
      const { getAssignmentGroupRepository } = require("../lib/infrastructure/servicenow/repositories");
      mockRepository = getAssignmentGroupRepository();
      vi.clearAllMocks();
    });

    afterEach(() => {
      cache.invalidate();
    });

    it("should cache data to reduce API calls", async () => {
      const mockGroups = [
        { text: "Group 1", value: "group1" },
        { text: "Group 2", value: "group2" },
        { text: "Group 3", value: "group3" }
      ];

      mockRepository.findAll.mockResolvedValue(mockGroups);

      // First call should fetch from ServiceNow
      const start1 = Date.now();
      const result1 = await cache.getGroups();
      const duration1 = Date.now() - start1;

      expect(result1).toEqual(mockGroups);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
      expect(duration1).toBeGreaterThan(0); // Should take some time for API call

      // Second call should use cache
      const start2 = Date.now();
      const result2 = await cache.getGroups();
      const duration2 = Date.now() - start2;

      expect(result2).toEqual(mockGroups);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1); // Still only called once
      expect(duration2).toBeLessThan(duration1); // Should be faster from cache
    });

    it("should handle concurrent requests efficiently", async () => {
      const mockGroups = [
        { text: "Group 1", value: "group1" }
      ];

      mockRepository.findAll.mockResolvedValue(mockGroups);

      // Make multiple concurrent requests
      const promises = Array(10).fill(null).map(() => cache.getGroups());
      const results = await Promise.all(promises);

      // All should return the same result
      results.forEach(result => {
        expect(result).toEqual(mockGroups);
      });

      // Should only call the repository once
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it("should respect TTL and refresh when expired", async () => {
      const mockGroups1 = [
        { text: "Group 1", value: "group1" }
      ];
      const mockGroups2 = [
        { text: "Group 2", value: "group2" }
      ];

      mockRepository.findAll
        .mockResolvedValueOnce(mockGroups1)
        .mockResolvedValueOnce(mockGroups2);

      // First call
      const result1 = await cache.getGroups();
      expect(result1).toEqual(mockGroups1);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);

      // Mock cache expiration by manipulating internal state
      (cache as any).lastFetch = Date.now() - 6 * 60 * 1000; // 6 minutes ago (expired)

      // Second call should fetch fresh data
      const result2 = await cache.getGroups();
      expect(result2).toEqual(mockGroups2);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(2);
    });

    it("should limit cache size to prevent memory issues", async () => {
      const mockGroups = Array(150).fill(null).map((_, i) => ({
        text: `Group ${i}`,
        value: `group${i}`
      }));

      mockRepository.findAll.mockResolvedValue(mockGroups);

      const result = await cache.getGroups();

      // Should respect Slack's limit of 100 options
      expect(result).toHaveLength(100);
      expect(result).toEqual(mockGroups.slice(0, 100));
    });

    it("should handle cache invalidation properly", async () => {
      const mockGroups1 = [
        { text: "Group 1", value: "group1" }
      ];
      const mockGroups2 = [
        { text: "Group 2", value: "group2" }
      ];

      mockRepository.findAll
        .mockResolvedValueOnce(mockGroups1)
        .mockResolvedValueOnce(mockGroups2);

      // First call
      const result1 = await cache.getGroups();
      expect(result1).toEqual(mockGroups1);

      // Invalidate cache
      cache.invalidate();

      // Second call should fetch fresh data
      const result2 = await cache.getGroups();
      expect(result2).toEqual(mockGroups2);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(2);
    });

    it("should handle fetch errors gracefully", async () => {
      const error = new Error("ServiceNow API error");
      mockRepository.findAll.mockRejectedValue(error);

      const result = await cache.getGroups();
      expect(result).toEqual([]);
    });

    it("should provide cache statistics", () => {
      const stats = (cache as any).getStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.lastFetch).toBe("number");
      expect(typeof stats.ttl).toBe("number");
      expect(stats.ttl).toBe(5 * 60 * 1000); // 5 minutes
    });
  });

  describe("InteractiveStateManager Performance", () => {
    let stateManager: InteractiveStateManager;

    beforeEach(() => {
      stateManager = new InteractiveStateManager();
      vi.clearAllMocks();
    });

    it("should handle bulk state operations efficiently", async () => {
      const states = Array(50).fill(null).map((_, i) => ({
        type: "kb_approval" as const,
        channelId: `C${i}`,
        messageTs: `1234567890.${i}`,
        payload: {
          caseNumber: `INC00100${i}`,
          article: {
            title: `Test Article ${i}`,
            problem: `Test Problem ${i}`,
            solution: `Test Solution ${i}`,
            environment: "Test Environment",
            tags: ["test"]
          }
        }
      }));

      // Save all states
      const savePromises = states.map(state => 
        stateManager.saveState(state.type, state.channelId, state.messageTs, state.payload)
      );
      const results = await Promise.all(savePromises);

      expect(results).toHaveLength(50);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result?.type).toBe("kb_approval");
      });
    });

    it("should efficiently cleanup expired states", async () => {
      // This would test the cleanup performance with many expired states
      const startTime = Date.now();
      const result = await stateManager.cleanupExpiredStates();
      const duration = Date.now() - startTime;

      expect(typeof result).toBe("number");
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it("should handle concurrent state operations", async () => {
      const channelId = "C123456";
      const messageTs = "1234567890.123456";

      // Concurrent save and get operations
      const savePromise = stateManager.saveState(
        "context_update",
        channelId,
        messageTs,
        {
          entityName: "Test Entity",
          proposedChanges: { field: "value" },
          proposedBy: "U123",
          sourceChannelId: channelId
        }
      );

      const getPromise = stateManager.getState(channelId, messageTs);

      const [saveResult, getResult] = await Promise.all([savePromise, getPromise]);

      expect(saveResult).toBeDefined();
      expect(getResult).toBeDefined(); // Should find the saved state
    });
  });

  describe("Memory Management", () => {
    it("should not leak memory with repeated operations", async () => {
      const cache = new AssignmentGroupCache();
      const mockGroups = [
        { text: "Group 1", value: "group1" }
      ];

      const { getAssignmentGroupRepository } = require("../lib/infrastructure/servicenow/repositories");
      const mockRepository = getAssignmentGroupRepository();
      mockRepository.findAll.mockResolvedValue(mockGroups);

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await cache.getGroups();
        if (i % 100 === 0) {
          cache.invalidate();
        }
      }

      // Should not throw and should still work
      const result = await cache.getGroups();
      expect(result).toEqual(mockGroups);
    });

    it("should handle large payloads efficiently", async () => {
      const stateManager = new InteractiveStateManager();
      
      const largePayload = {
        caseNumber: "INC001001",
        article: {
          title: "A".repeat(1000),
          problem: "B".repeat(1000),
          solution: "C".repeat(1000),
          environment: "D".repeat(1000),
          rootCause: "E".repeat(1000),
          tags: Array(100).fill(null).map((_, i) => `tag${i}`)
        }
      };

      const startTime = Date.now();
      const result = await stateManager.saveState(
        "kb_approval",
        "C123456",
        "1234567890.123456",
        largePayload
      );
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe("Rate Limiting and Throttling", () => {
    it("should handle rapid successive requests", async () => {
      const cache = new AssignmentGroupCache();
      const mockGroups = [
        { text: "Group 1", value: "group1" }
      ];

      const { getAssignmentGroupRepository } = require("../lib/infrastructure/servicenow/repositories");
      const mockRepository = getAssignmentGroupRepository();
      mockRepository.findAll.mockResolvedValue(mockGroups);

      // Make rapid requests
      const startTime = Date.now();
      const promises = Array(100).fill(null).map(() => cache.getGroups());
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All should return the same result
      results.forEach(result => {
        expect(result).toEqual(mockGroups);
      });

      // Should only call the repository once due to caching
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
      
      // Should complete quickly due to caching
      expect(duration).toBeLessThan(100);
    });

    it("should implement backoff for failed requests", async () => {
      const cache = new AssignmentGroupCache();
      const { getAssignmentGroupRepository } = require("../lib/infrastructure/servicenow/repositories");
      const mockRepository = getAssignmentGroupRepository();
      
      // Mock rate limit error then success
      mockRepository.findAll
        .mockRejectedValueOnce(new Error("Rate limit exceeded"))
        .mockResolvedValueOnce([{ text: "Group 1", value: "group1" }]);

      const startTime = Date.now();
      const result = await cache.getGroups();
      const duration = Date.now() - startTime;

      expect(result).toEqual([{ text: "Group 1", value: "group1" }]);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(2);
      expect(duration).toBeGreaterThan(100); // Should have some delay for retry
    });
  });

  describe("Resource Cleanup", () => {
    it("should cleanup expired states periodically", async () => {
      const stateManager = new InteractiveStateManager();
      
      // Save some states
      await stateManager.saveState(
        "kb_approval",
        "C123456",
        "1234567890.123456",
        {
          caseNumber: "INC001001",
          article: {
            title: "Test Article",
            problem: "Test Problem",
            solution: "Test Solution",
            environment: "Test Environment",
            tags: ["test"]
          }
        },
        { expiresInHours: 0.001 } // Very short TTL (3.6 seconds)
      );

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Cleanup should remove expired states
      const cleanedCount = await stateManager.cleanupExpiredStates();
      expect(typeof cleanedCount).toBe("number");
    });

    it("should handle cache cleanup gracefully", async () => {
      const cache = new AssignmentGroupCache();
      
      // Fill cache with data
      const { getAssignmentGroupRepository } = require("../lib/infrastructure/servicenow/repositories");
      const mockRepository = getAssignmentGroupRepository();
      mockRepository.findAll.mockResolvedValue([
        { text: "Group 1", value: "group1" }
      ]);

      await cache.getGroups();
      
      // Invalidate and verify cleanup
      cache.invalidate();
      
      // Should still work after invalidation
      const result = await cache.getGroups();
      expect(result).toEqual([{ text: "Group 1", value: "group1" }]);
    });
  });

  describe("Performance Monitoring", () => {
    it("should track operation metrics", async () => {
      const cache = new AssignmentGroupCache();
      const mockGroups = [
        { text: "Group 1", value: "group1" }
      ];

      const { getAssignmentGroupRepository } = require("../lib/infrastructure/servicenow/repositories");
      const mockRepository = getAssignmentGroupRepository();
      mockRepository.findAll.mockResolvedValue(mockGroups);

      // Monitor performance
      const startTime = Date.now();
      await cache.getGroups();
      const firstCallDuration = Date.now() - startTime;

      const secondStartTime = Date.now();
      await cache.getGroups();
      const secondCallDuration = Date.now() - secondStartTime;

      // Second call should be significantly faster
      expect(secondCallDuration).toBeLessThan(firstCallDuration);
      expect(secondCallDuration).toBeLessThan(10); // Should be very fast from cache
    });

    it("should handle performance degradation gracefully", async () => {
      const cache = new AssignmentGroupCache();
      const { getAssignmentGroupRepository } = require("../lib/infrastructure/servicenow/repositories");
      const mockRepository = getAssignmentGroupRepository();
      
      // Mock slow response
      mockRepository.findAll.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 2000))
      );

      const startTime = Date.now();
      const result = await cache.getGroups();
      const duration = Date.now() - startTime;

      expect(result).toEqual([]);
      expect(duration).toBeGreaterThan(2000); // Should wait for the slow response
    });
  });
});