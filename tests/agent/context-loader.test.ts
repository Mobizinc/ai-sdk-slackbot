/**
 * Comprehensive Unit Tests for Context Loader
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadContext } from "../../lib/agent/context-loader";
import { getContextManager } from "../../lib/context-manager";
import { getBusinessContextService } from "../../lib/services/business-context-service";
import { getSearchFacadeService } from "../../lib/services/search-facade";
import { getSlackMessagingService } from "../../lib/services/slack-messaging";
import { generateDiscoveryContextPack } from "../../lib/agent/discovery/context-pack";

// Mock dependencies
const configValues: Record<string, any> = {
  discoveryContextPackEnabled: false,
  discoverySlackMessageLimit: 5,
  discoverySimilarCasesTopK: 3,
};

vi.mock("../../lib/config", () => ({
  getConfigValue: vi.fn((key: string) => configValues[key]),
  getConfig: vi.fn(),
  getConfigSync: vi.fn(),
  config: {},
}));

vi.mock("../../lib/agent/discovery/context-pack", () => ({
  generateDiscoveryContextPack: vi.fn().mockResolvedValue({
    generatedAt: "2024-01-01T00:00:00.000Z",
    metadata: { caseNumbers: [] },
    policyAlerts: [],
  }),
}));

vi.mock("../../lib/context-manager");
vi.mock("../../lib/services/business-context-service");
vi.mock("../../lib/services/search-facade");
vi.mock("../../lib/services/slack-messaging");
vi.mock("../../lib/db/repositories/business-context-repository");

describe("Context Loader", () => {
  let mockContextManager: any;
  let mockBusinessContextService: any;
  let mockSearchFacade: any;
  let mockSlackMessaging: any;
  let mockBusinessContextRepository: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    configValues.discoveryContextPackEnabled = false;
    (generateDiscoveryContextPack as unknown as vi.Mock).mockResolvedValue({
      generatedAt: "2024-01-01T00:00:00.000Z",
      metadata: { caseNumbers: [] },
      policyAlerts: [],
    });

    // Setup context manager mock
    mockContextManager = {
      extractCaseNumbers: vi.fn().mockReturnValue([]),
      getContextsForCase: vi.fn().mockReturnValue([]),
    };
    (getContextManager as unknown as vi.Mock).mockReturnValue(mockContextManager);

    // Setup business context service mock
    mockBusinessContextService = {
      getContextForCompany: vi.fn().mockResolvedValue(null),
    };
    (getBusinessContextService as unknown as vi.Mock).mockReturnValue(mockBusinessContextService);

    // Setup search facade mock
    mockSearchFacade = {
      isAzureSearchConfigured: vi.fn().mockReturnValue(false),
      searchSimilarCases: vi.fn().mockResolvedValue([]),
    };
    (getSearchFacadeService as unknown as vi.Mock).mockReturnValue(mockSearchFacade);

    // Setup slack messaging mock
    mockSlackMessaging = {
      getBotUserId: vi.fn().mockResolvedValue("B123456"),
      getThread: vi.fn().mockResolvedValue([]),
    };
    (getSlackMessagingService as unknown as vi.Mock).mockReturnValue(mockSlackMessaging);

    // Setup business context repository mock
    const businessContextRepo = await import("../../lib/db/repositories/business-context-repository");
    mockBusinessContextRepository = {
      getAllActive: vi.fn().mockResolvedValue([]),
    };
    (businessContextRepo.getBusinessContextRepository as any).mockReturnValue(mockBusinessContextRepository);
  });

  describe("Case Number Extraction", () => {
    it("should extract case numbers from messages", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Working on SCS0001234" }],
      });

      expect(mockContextManager.extractCaseNumbers).toHaveBeenCalled();
      expect(result.metadata.caseNumbers).toEqual(["SCS0001234"]);
    });

    it("should use explicit case numbers when provided", async () => {
      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
        explicitCaseNumbers: ["SCS0005678"],
      });

      expect(mockContextManager.extractCaseNumbers).not.toHaveBeenCalled();
      expect(result.metadata.caseNumbers).toEqual(["SCS0005678"]);
    });

    it("should handle multiple case numbers", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234", "SCS0005678"]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Cases SCS0001234 and SCS0005678" }],
      });

      expect(result.metadata.caseNumbers).toEqual(["SCS0001234", "SCS0005678"]);
    });

    it("should handle messages with no case numbers", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue([]);

      const result = await loadContext({
        messages: [{ role: "user", content: "General question" }],
      });

      expect(result.metadata.caseNumbers).toEqual([]);
    });
  });

  describe("Case Context Loading", () => {
    it("should load case context when case number is found", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);
      mockContextManager.getContextsForCase.mockReturnValue([
        {
          caseNumber: "SCS0001234",
          channelName: "Acme Corp",
          channelId: "C123456",
        },
      ]);

      const result = await loadContext({
        messages: [{ role: "user", content: "About SCS0001234" }],
      });

      expect(mockContextManager.getContextsForCase).toHaveBeenCalledWith("SCS0001234");
      expect(result.metadata.caseContext).toEqual({
        caseNumber: "SCS0001234",
        channelName: "Acme Corp",
        channelId: "C123456",
      });
    });

    it("should handle when case context is not found", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0009999"]);
      mockContextManager.getContextsForCase.mockReturnValue([]);

      const result = await loadContext({
        messages: [{ role: "user", content: "About SCS0009999" }],
      });

      expect(result.metadata.caseContext).toBeUndefined();
    });
  });

  describe("Company Name Resolution", () => {
    it("should resolve company name from case context", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);
      mockContextManager.getContextsForCase.mockReturnValue([
        {
          caseNumber: "SCS0001234",
          channelName: "Acme Corp",
        },
      ]);

      const result = await loadContext({
        messages: [{ role: "user", content: "About SCS0001234" }],
      });

      expect(result.metadata.companyName).toBe("Acme Corp");
    });

    it("should detect company name from message text when not in case context", async () => {
      mockBusinessContextRepository.getAllActive.mockResolvedValue([
        {
          entityName: "Globex Corporation",
          aliases: ["Globex", "Globex Inc"],
        },
      ]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Question about Globex Inc support" }],
      });

      expect(result.metadata.companyName).toBe("Globex Corporation");
    });

    it("should match company aliases case-insensitively", async () => {
      mockBusinessContextRepository.getAllActive.mockResolvedValue([
        {
          entityName: "Initech",
          aliases: ["INITECH", "Initech LLC"],
        },
      ]);

      const result = await loadContext({
        messages: [{ role: "user", content: "initech has an issue" }],
      });

      expect(result.metadata.companyName).toBe("Initech");
    });

    it("should handle when no company is detected", async () => {
      mockBusinessContextRepository.getAllActive.mockResolvedValue([
        {
          entityName: "Unknown Corp",
          aliases: ["Unknown"],
        },
      ]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Generic question" }],
      });

      expect(result.metadata.companyName).toBeUndefined();
    });

    it("should handle errors in company detection gracefully", async () => {
      mockBusinessContextRepository.getAllActive.mockRejectedValue(new Error("DB error"));

      const result = await loadContext({
        messages: [{ role: "user", content: "Some question" }],
      });

      // Should not throw, should continue without company name
      expect(result.metadata.companyName).toBeUndefined();
    });
  });

  describe("Discovery Context Pack Integration", () => {
    it("should attach discovery pack when feature enabled", async () => {
      configValues.discoveryContextPackEnabled = true;
      (generateDiscoveryContextPack as unknown as vi.Mock).mockResolvedValue({
        generatedAt: "2025-01-01T00:00:00.000Z",
        metadata: { caseNumbers: [] },
        policyAlerts: [],
        businessContext: { entityName: "Acme" },
      });

      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
      });

      expect(generateDiscoveryContextPack).toHaveBeenCalled();
      expect(result.metadata.discovery).toEqual(
        expect.objectContaining({ businessContext: { entityName: "Acme" } })
      );
    });
  });

  describe("Business Context Enrichment", () => {
    it("should load business context when company is identified", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);
      mockContextManager.getContextsForCase.mockReturnValue([
        { channelName: "Acme Corp" },
      ]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue({
        entityName: "Acme Corp",
        entityType: "CLIENT",
        contextStewards: [],
      });

      const result = await loadContext({
        messages: [{ role: "user", content: "About SCS0001234" }],
      });

      expect(mockBusinessContextService.getContextForCompany).toHaveBeenCalledWith("Acme Corp");
      expect(result.metadata.businessContext).toEqual({
        entityName: "Acme Corp",
        entityType: "CLIENT",
        contextStewards: [],
      });
    });

    it("should handle when business context is not found", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);
      mockContextManager.getContextsForCase.mockReturnValue([
        { channelName: "Unknown Company" },
      ]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(null);

      const result = await loadContext({
        messages: [{ role: "user", content: "About SCS0001234" }],
      });

      expect(result.metadata.businessContext).toBeNull();
    });

    it("should handle business context service errors gracefully", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);
      mockContextManager.getContextsForCase.mockReturnValue([
        { channelName: "Acme Corp" },
      ]);
      mockBusinessContextService.getContextForCompany.mockRejectedValue(new Error("Service error"));

      const result = await loadContext({
        messages: [{ role: "user", content: "About SCS0001234" }],
      });

      // Should continue without business context
      expect(result.metadata.businessContext).toBeNull();
    });
  });

  describe("Similar Cases Search", () => {
    it("should search for similar cases when Azure Search is configured", async () => {
      mockSearchFacade.isAzureSearchConfigured.mockReturnValue(true);
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);
      mockContextManager.getContextsForCase.mockReturnValue([
        { channelName: "Acme Corp" },
      ]);
      mockSearchFacade.searchSimilarCases.mockResolvedValue([
        {
          case_number: "SCS0005555",
          score: 0.89,
          content: "Similar case content",
        },
      ]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Network connectivity issue SCS0001234" }],
      });

      expect(mockSearchFacade.searchSimilarCases).toHaveBeenCalledWith(
        "Network connectivity issue SCS0001234",
        {
          clientId: "Acme Corp",
          topK: 3,
        }
      );
      expect(result.metadata.similarCases).toHaveLength(1);
    });

    it("should not search when Azure Search is not configured", async () => {
      mockSearchFacade.isAzureSearchConfigured.mockReturnValue(false);

      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
      });

      expect(mockSearchFacade.searchSimilarCases).not.toHaveBeenCalled();
      expect(result.metadata.similarCases).toBeUndefined();
    });

    it("should not include similarCases in metadata when no results found", async () => {
      mockSearchFacade.isAzureSearchConfigured.mockReturnValue(true);
      mockSearchFacade.searchSimilarCases.mockResolvedValue([]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
      });

      expect(result.metadata.similarCases).toBeUndefined();
    });

    it("should truncate user transcript to 500 characters", async () => {
      mockSearchFacade.isAzureSearchConfigured.mockReturnValue(true);
      const longMessage = "A".repeat(1000);

      await loadContext({
        messages: [{ role: "user", content: longMessage }],
      });

      const call = mockSearchFacade.searchSimilarCases.mock.calls[0];
      expect(call[0].length).toBe(500);
    });

    it("should only use user messages for search transcript", async () => {
      mockSearchFacade.isAzureSearchConfigured.mockReturnValue(true);

      await loadContext({
        messages: [
          { role: "user", content: "User message 1" },
          { role: "assistant", content: "Assistant response" },
          { role: "user", content: "User message 2" },
        ],
      });

      const call = mockSearchFacade.searchSimilarCases.mock.calls[0];
      expect(call[0]).toBe("User message 1\nUser message 2");
    });
  });

  describe("Thread History Loading", () => {
    it("should load thread history when threadTs and channelId are provided", async () => {
      mockSlackMessaging.getBotUserId.mockResolvedValue("B123456");
      mockSlackMessaging.getThread.mockResolvedValue([
        { role: "user", content: "Thread message 1" },
        { role: "assistant", content: "Thread response 1" },
      ]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Current message" }],
        channelId: "C123456",
        threadTs: "1234567890.123456",
      });

      expect(mockSlackMessaging.getBotUserId).toHaveBeenCalled();
      expect(mockSlackMessaging.getThread).toHaveBeenCalledWith(
        "C123456",
        "1234567890.123456",
        "B123456"
      );
      expect(result.metadata.threadHistory).toHaveLength(2);
    });

    it("should not load thread history when threadTs is missing", async () => {
      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
        channelId: "C123456",
      });

      expect(mockSlackMessaging.getThread).not.toHaveBeenCalled();
      expect(result.metadata.threadHistory).toBeUndefined();
    });

    it("should not load thread history when channelId is missing", async () => {
      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
        threadTs: "1234567890.123456",
      });

      expect(mockSlackMessaging.getThread).not.toHaveBeenCalled();
      expect(result.metadata.threadHistory).toBeUndefined();
    });

    it("should handle thread loading errors gracefully", async () => {
      mockSlackMessaging.getBotUserId.mockRejectedValue(new Error("Bot ID error"));

      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
        channelId: "C123456",
        threadTs: "1234567890.123456",
      });

      // Should continue without thread history
      expect(result.metadata.threadHistory).toBeUndefined();
    });

    it("should not include threadHistory in metadata when thread is empty", async () => {
      mockSlackMessaging.getBotUserId.mockResolvedValue("B123456");
      mockSlackMessaging.getThread.mockResolvedValue([]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Test message" }],
        channelId: "C123456",
        threadTs: "1234567890.123456",
      });

      expect(result.metadata.threadHistory).toBeUndefined();
    });
  });

  describe("Message Normalization", () => {
    it("should handle string content", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);

      const result = await loadContext({
        messages: [{ role: "user", content: "Test SCS0001234" }],
      });

      expect(result.metadata.caseNumbers).toEqual(["SCS0001234"]);
    });

    it("should handle array content", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);

      const result = await loadContext({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Test SCS0001234" },
              { type: "text", text: "More text" },
            ] as any,
          },
        ],
      });

      expect(result.metadata.caseNumbers).toEqual(["SCS0001234"]);
    });

    it("should handle object content with text property", async () => {
      mockContextManager.extractCaseNumbers.mockReturnValue(["SCS0001234"]);

      const result = await loadContext({
        messages: [{ role: "user", content: { text: "Test SCS0001234" } as any }],
      });

      expect(result.metadata.caseNumbers).toEqual(["SCS0001234"]);
    });

    it("should handle empty messages array", async () => {
      const result = await loadContext({
        messages: [],
      });

      expect(result.messages).toEqual([]);
      expect(result.metadata.caseNumbers).toEqual([]);
    });
  });
});
