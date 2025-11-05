/**
 * Business Context - Slack Channel Lookup Integration Tests
 * Tests for automatic client detection via Slack channel ID/name
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BusinessContextRepository } from "../lib/db/repositories/business-context-repository";
import { BusinessContextService } from "../lib/services/business-context-service";

// Mock database client
vi.mock("../lib/db/client", () => ({
  getDb: vi.fn(() => mockDb),
}));

let mockDb: any;

describe("Business Context - Slack Channel Lookup", () => {
  let repository: BusinessContextRepository;
  let service: BusinessContextService;

  beforeEach(() => {
    // Create fresh instances for each test
    repository = new BusinessContextRepository();
    service = new BusinessContextService();

    // Mock database with sample data
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Repository - findBySlackChannelId", () => {
    it("should find business context by Slack channel ID", async () => {
      const mockContext = {
        id: 1,
        entityName: "Altus Community Healthcare",
        entityType: "CLIENT",
        slackChannels: [
          {
            name: "altus-helpdesk",
            channelId: "C0968PZTPHB",
            notes: "Primary triage channel"
          }
        ],
        aliases: ["Altus", "Altus Health"],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock the database query to return our test context
      mockDb.where = vi.fn().mockReturnThis();
      mockDb.limit = vi.fn().mockResolvedValue([mockContext]);

      const result = await repository.findBySlackChannelId("C0968PZTPHB");

      expect(result).toBeDefined();
      expect(result?.entityName).toBe("Altus Community Healthcare");
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("should return null if channel ID not found", async () => {
      mockDb.limit = vi.fn().mockResolvedValue([]);

      const result = await repository.findBySlackChannelId("C_NOT_FOUND");

      expect(result).toBeNull();
    });

    it("should return null if database is unavailable", async () => {
      // Mock getDb to return null
      vi.mocked(require("../lib/db/client").getDb).mockReturnValue(null);

      const result = await repository.findBySlackChannelId("C0968PZTPHB");

      expect(result).toBeNull();
    });
  });

  describe("Repository - findBySlackChannelName", () => {
    it("should find business context by Slack channel name", async () => {
      const mockContexts = [
        {
          id: 1,
          entityName: "Altus Community Healthcare",
          entityType: "CLIENT",
          slackChannels: [
            {
              name: "altus-helpdesk",
              channelId: "C0968PZTPHB",
            }
          ],
          isActive: true,
        },
        {
          id: 2,
          entityName: "Neighbors Emergency Center",
          entityType: "CLIENT",
          slackChannels: [
            {
              name: "neighbors-support",
              channelId: "C1234567890",
            }
          ],
          isActive: true,
        },
      ];

      mockDb.where = vi.fn().mockResolvedValue(mockContexts);

      const result = await repository.findBySlackChannelName("altus-helpdesk");

      expect(result).toBeDefined();
      expect(result?.entityName).toBe("Altus Community Healthcare");
    });

    it("should perform case-insensitive search", async () => {
      const mockContexts = [
        {
          id: 1,
          entityName: "Altus Community Healthcare",
          slackChannels: [{ name: "altus-helpdesk" }],
          isActive: true,
        },
      ];

      mockDb.where = vi.fn().mockResolvedValue(mockContexts);

      const result = await repository.findBySlackChannelName("ALTUS-HELPDESK");

      expect(result).toBeDefined();
      expect(result?.entityName).toBe("Altus Community Healthcare");
    });

    it("should return null if channel name not found", async () => {
      mockDb.where = vi.fn().mockResolvedValue([
        {
          id: 1,
          entityName: "Some Client",
          slackChannels: [{ name: "other-channel" }],
          isActive: true,
        },
      ]);

      const result = await repository.findBySlackChannelName("non-existent-channel");

      expect(result).toBeNull();
    });
  });

  describe("Service - getContextForSlackChannel", () => {
    it("should prioritize channelId over channelName", async () => {
      const mockContext = {
        id: 1,
        entityName: "Altus Community Healthcare",
        entityType: "CLIENT",
        slackChannels: [{ name: "altus-helpdesk", channelId: "C0968PZTPHB" }],
        aliases: ["Altus"],
        keyContacts: [],
        cmdbIdentifiers: [],
        contextStewards: [],
        relatedEntities: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock successful channelId lookup
      mockDb.limit = vi.fn().mockResolvedValue([mockContext]);

      const result = await service.getContextForSlackChannel("C0968PZTPHB", "altus-helpdesk");

      expect(result).toBeDefined();
      expect(result?.entityName).toBe("Altus Community Healthcare");
    });

    it("should fall back to channelName if channelId fails", async () => {
      const mockContexts = [
        {
          id: 1,
          entityName: "Altus Community Healthcare",
          slackChannels: [{ name: "altus-helpdesk" }],
          isActive: true,
        },
      ];

      // Mock channelId returning nothing, channelName returning data
      mockDb.limit = vi.fn().mockResolvedValue([]);
      mockDb.where = vi.fn().mockResolvedValue(mockContexts);

      const result = await service.getContextForSlackChannel("C_UNKNOWN", "altus-helpdesk");

      expect(result).toBeDefined();
      expect(result?.entityName).toBe("Altus Community Healthcare");
    });

    it("should return null if neither channelId nor channelName found", async () => {
      mockDb.limit = vi.fn().mockResolvedValue([]);
      mockDb.where = vi.fn().mockResolvedValue([]);

      const result = await service.getContextForSlackChannel("C_UNKNOWN", "unknown-channel");

      expect(result).toBeNull();
    });

    it("should handle missing channelName parameter", async () => {
      mockDb.limit = vi.fn().mockResolvedValue([]);

      const result = await service.getContextForSlackChannel("C_UNKNOWN");

      expect(result).toBeNull();
    });
  });

  describe("Integration - Full Flow", () => {
    it("should enable automatic client detection in Slack bot", async () => {
      // Simulate the flow: Slack message arrives in #altus-helpdesk
      const channelId = "C0968PZTPHB";
      const channelName = "altus-helpdesk";

      const mockContext = {
        id: 1,
        entityName: "Altus Community Healthcare",
        entityType: "CLIENT",
        industry: "Healthcare",
        description: "Managed services client",
        aliases: ["Altus", "Altus Health"],
        slackChannels: [{ name: channelName, channelId }],
        technologyPortfolio: "Azure, Microsoft 365, Cisco",
        serviceDetails: "24/7 helpdesk support",
        keyContacts: [],
        cmdbIdentifiers: [],
        contextStewards: [],
        relatedEntities: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit = vi.fn().mockResolvedValue([mockContext]);

      // Bot receives message and looks up channel
      const context = await service.getContextForSlackChannel(channelId, channelName);

      // Verify complete context is available
      expect(context).toBeDefined();
      expect(context?.entityName).toBe("Altus Community Healthcare");
      expect(context?.technologyPortfolio).toBe("Azure, Microsoft 365, Cisco");
      expect(context?.serviceDetails).toBe("24/7 helpdesk support");
      expect(context?.aliases).toContain("Altus");

      // Verify it's NOT using static fallback (which lacks these fields)
      expect(context?.technologyPortfolio).toBeDefined();
      expect(context?.serviceDetails).toBeDefined();
    });

    it("should handle multiple channels for same client", async () => {
      const mockContext = {
        id: 1,
        entityName: "Altus Community Healthcare",
        slackChannels: [
          { name: "altus-helpdesk", channelId: "C0968PZTPHB" },
          { name: "altus-critical", channelId: "C9876543210" },
          { name: "altus-projects", channelId: "C1111111111" },
        ],
        isActive: true,
      };

      // Test each channel resolves to same client
      for (const channel of mockContext.slackChannels) {
        mockDb.limit = vi.fn().mockResolvedValue([mockContext]);

        const result = await repository.findBySlackChannelId(channel.channelId!);

        expect(result?.entityName).toBe("Altus Community Healthcare");
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully in channelId lookup", async () => {
      mockDb.limit = vi.fn().mockRejectedValue(new Error("Database connection failed"));

      const result = await repository.findBySlackChannelId("C0968PZTPHB");

      expect(result).toBeNull();
    });

    it("should handle database errors gracefully in channelName lookup", async () => {
      mockDb.where = vi.fn().mockRejectedValue(new Error("Query failed"));

      const result = await repository.findBySlackChannelName("altus-helpdesk");

      expect(result).toBeNull();
    });

    it("should handle malformed slackChannels data", async () => {
      const mockContexts = [
        {
          id: 1,
          entityName: "Test Client",
          slackChannels: null, // Invalid data
          isActive: true,
        },
      ];

      mockDb.where = vi.fn().mockResolvedValue(mockContexts);

      const result = await repository.findBySlackChannelName("test-channel");

      expect(result).toBeNull();
    });
  });
});
