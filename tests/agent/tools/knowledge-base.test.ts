/**
 * Unit Tests for Knowledge Base Generation Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentTools } from "../../../lib/agent/tools/factory";
import type { ChatMessage } from "../../../lib/agent/types";

// Mock dependencies
vi.mock("../../../lib/context-manager");
vi.mock("../../../lib/tools/servicenow");
vi.mock("../../../lib/services/kb-generator");

describe("Knowledge Base Generation Tool", () => {
  let mockContextManager: any;
  let mockServiceNowClient: any;
  let mockKBGenerator: any;
  let tools: any;
  const mockUpdateStatus = vi.fn();

  const createMockMessages = (): ChatMessage[] => [
    { role: "user", content: "Test message" },
  ];

  const createMockContext = (overrides = {}) => ({
    caseNumber: "SCS0001234",
    channelId: "C123456",
    threadTs: "1234567890.123456",
    messages: [
      { user: "U123456", text: "User had an issue", timestamp: "1234567890.100000" },
      { user: "UBOT", text: "I helped resolve it", timestamp: "1234567890.200000" },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup context manager mock
    const contextManager = await import("../../../lib/context-manager");
    mockContextManager = {
      getContextsForCase: vi.fn().mockReturnValue([]),
    };
    (contextManager.getContextManager as any).mockReturnValue(mockContextManager);

    // Setup ServiceNow client mock
    const serviceNow = await import("../../../lib/tools/servicenow");
    mockServiceNowClient = serviceNow.serviceNowClient as any;
    mockServiceNowClient.isConfigured = vi.fn().mockReturnValue(true);
    mockServiceNowClient.getCase = vi.fn();

    // Setup KB generator mock
    const kbGenerator = await import("../../../lib/services/kb-generator");
    mockKBGenerator = {
      generateArticle: vi.fn(),
    };
    (kbGenerator.getKBGenerator as any).mockReturnValue(mockKBGenerator);

    // Create tools
    tools = createAgentTools({
      messages: createMockMessages(),
      caseNumbers: ["SCS0001234"],
      updateStatus: mockUpdateStatus,
      options: { channelId: "C123456" },
    });
  });

  describe("KB Generation - Success Cases", () => {
    it("should generate KB article successfully", async () => {
      const mockContext = createMockContext();
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);

      const mockCaseDetails = {
        number: "SCS0001234",
        short_description: "Test case",
        state: "Resolved",
      };
      mockServiceNowClient.getCase.mockResolvedValue(mockCaseDetails);

      const mockArticle = {
        title: "How to resolve X issue",
        content: "Step by step resolution",
        tags: ["network", "troubleshooting"],
      };
      mockKBGenerator.generateArticle.mockResolvedValue({
        isDuplicate: false,
        article: mockArticle,
        confidence: 85,
        similarExistingKBs: [],
      });

      const result = await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(mockContextManager.getContextsForCase).toHaveBeenCalledWith("SCS0001234");
      expect(mockServiceNowClient.getCase).toHaveBeenCalledWith("SCS0001234", expect.any(Object));
      expect(mockKBGenerator.generateArticle).toHaveBeenCalledWith(
        mockContext,
        mockCaseDetails
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is generating KB article for SCS0001234..."
      );
      expect(result).toEqual({
        success: true,
        article: mockArticle,
        confidence: 85,
        similar_kbs: [],
        message: "KB article generated with 85% confidence.",
      });
    });

    it("should use specified thread timestamp when provided", async () => {
      const context1 = createMockContext({ threadTs: "1111111111.111111" });
      const context2 = createMockContext({ threadTs: "2222222222.222222" });
      mockContextManager.getContextsForCase.mockReturnValue([context1, context2]);

      mockServiceNowClient.getCase.mockResolvedValue({
        number: "SCS0001234",
      });
      mockKBGenerator.generateArticle.mockResolvedValue({
        isDuplicate: false,
        article: { title: "Test" },
        confidence: 75,
        similarExistingKBs: [],
      });

      await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
        threadTs: "2222222222.222222",
      });

      expect(mockKBGenerator.generateArticle).toHaveBeenCalledWith(
        context2,
        expect.any(Object)
      );
    });

    it("should use latest context when no threadTs specified", async () => {
      const context1 = createMockContext({ threadTs: "1111111111.111111" });
      const context2 = createMockContext({ threadTs: "2222222222.222222" });
      mockContextManager.getContextsForCase.mockReturnValue([context1, context2]);

      mockServiceNowClient.getCase.mockResolvedValue({
        number: "SCS0001234",
      });
      mockKBGenerator.generateArticle.mockResolvedValue({
        isDuplicate: false,
        article: { title: "Test" },
        confidence: 75,
        similarExistingKBs: [],
      });

      await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(mockKBGenerator.generateArticle).toHaveBeenCalledWith(
        context2,
        expect.any(Object)
      );
    });

    it("should handle case when ServiceNow is not configured", async () => {
      const mockContext = createMockContext();
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockServiceNowClient.isConfigured.mockReturnValue(false);

      mockKBGenerator.generateArticle.mockResolvedValue({
        isDuplicate: false,
        article: { title: "Test" },
        confidence: 80,
        similarExistingKBs: [],
      });

      await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(mockServiceNowClient.getCase).not.toHaveBeenCalled();
      expect(mockKBGenerator.generateArticle).toHaveBeenCalledWith(
        mockContext,
        null
      );
    });

    it("should handle case when ServiceNow fetch fails", async () => {
      const mockContext = createMockContext();
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockServiceNowClient.isConfigured.mockReturnValue(true);
      mockServiceNowClient.getCase.mockRejectedValue(new Error("API error"));

      mockKBGenerator.generateArticle.mockResolvedValue({
        isDuplicate: false,
        article: { title: "Test" },
        confidence: 80,
        similarExistingKBs: [],
      });

      await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(mockKBGenerator.generateArticle).toHaveBeenCalledWith(
        mockContext,
        null
      );
    });
  });

  describe("KB Generation - Duplicate Detection", () => {
    it("should detect duplicate KB articles", async () => {
      const mockContext = createMockContext();
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockServiceNowClient.getCase.mockResolvedValue({
        number: "SCS0001234",
      });

      const similarKBs = [
        { number: "KB0001", title: "Similar article 1", similarity: 0.92 },
        { number: "KB0002", title: "Similar article 2", similarity: 0.88 },
      ];

      mockKBGenerator.generateArticle.mockResolvedValue({
        isDuplicate: true,
        similarExistingKBs: similarKBs,
        article: null,
        confidence: 0,
      });

      const result = await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(result).toEqual({
        duplicate: true,
        similar_kbs: similarKBs,
        message: "Similar KB articles already exist. Consider updating an existing article instead.",
      });
    });

    it("should return similar KBs even when not duplicate", async () => {
      const mockContext = createMockContext();
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockServiceNowClient.getCase.mockResolvedValue({
        number: "SCS0001234",
      });

      const similarKBs = [
        { number: "KB0001", title: "Somewhat similar", similarity: 0.65 },
      ];

      mockKBGenerator.generateArticle.mockResolvedValue({
        isDuplicate: false,
        article: { title: "New article" },
        confidence: 85,
        similarExistingKBs: similarKBs,
      });

      const result = await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(result.similar_kbs).toEqual(similarKBs);
      expect(result.success).toBe(true);
    });
  });

  describe("KB Generation - Error Cases", () => {
    it("should return error when no context found", async () => {
      mockContextManager.getContextsForCase.mockReturnValue([]);

      const result = await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(result).toEqual({
        error: expect.stringContaining("No conversation context found for case SCS0001234"),
      });
    });

    it("should return error when specified thread not found", async () => {
      const mockContext = createMockContext({ threadTs: "1111111111.111111" });
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);

      const result = await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
        threadTs: "9999999999.999999",
      });

      expect(result).toEqual({
        error: "Context not found for the specified thread.",
      });
    });

    it("should handle KB generation errors gracefully", async () => {
      const mockContext = createMockContext();
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockServiceNowClient.getCase.mockResolvedValue({
        number: "SCS0001234",
      });

      mockKBGenerator.generateArticle.mockRejectedValue(
        new Error("Generation failed")
      );

      const result = await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(result).toEqual({
        error: "Generation failed",
      });
    });

    it("should handle non-Error exceptions", async () => {
      const mockContext = createMockContext();
      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockServiceNowClient.getCase.mockResolvedValue({
        number: "SCS0001234",
      });

      mockKBGenerator.generateArticle.mockRejectedValue("String error");

      const result = await tools.generateKBArticle.execute({
        caseNumber: "SCS0001234",
      });

      expect(result).toEqual({
        error: "Failed to generate KB article",
      });
    });
  });
});
