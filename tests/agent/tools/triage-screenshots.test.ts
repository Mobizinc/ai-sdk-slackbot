/**
 * Unit tests for triage tool screenshot handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTriageTool } from "../../../lib/agent/tools/triage";
import { serviceNowClient } from "../../../lib/tools/servicenow";
import { config } from "../../../lib/config";

// Mock dependencies
vi.mock("../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    isConfigured: vi.fn(),
    getCase: vi.fn(),
    getAttachments: vi.fn(),
    downloadAttachment: vi.fn(),
  },
}));

vi.mock("../../../lib/services/case-triage", () => ({
  getCaseTriageService: vi.fn().mockReturnValue({
    triageCase: vi.fn().mockResolvedValue({
      caseNumber: "SCS0001234",
      classification: {
        category: "Software",
        subcategory: "Application Error",
        confidence_score: 0.92,
        urgency_level: "High",
        quick_summary: "Database connection error",
        reasoning: "Error indicates DB connectivity issue",
        immediate_next_steps: ["Check DB connection", "Verify credentials"],
        technical_entities: ["SQL Server", "Connection String"],
      },
      similarCases: [],
      kbArticles: [],
      processingTimeMs: 1500,
      cached: false,
      recordTypeSuggestion: null,
    }),
  }),
}));

vi.mock("../../../lib/config", () => ({
  config: {
    enableMultimodalToolResults: false,
    maxImageAttachmentsPerTool: 3,
    maxImageSizeBytes: 5 * 1024 * 1024,
  },
}));

vi.mock("../../../lib/utils/image-processing", () => ({
  optimizeImageForClaude: vi.fn().mockResolvedValue({
    data: "optimized_screenshot_base64",
    media_type: "image/jpeg",
    size_bytes: 45000,
    was_optimized: true,
    original_size_bytes: 120000,
  }),
  isSupportedImageFormat: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn().mockReturnValue({}),
}));

describe("Triage Tool - Screenshot Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serviceNowClient.isConfigured).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("triage without screenshots (default)", () => {
    it("should triage case without fetching screenshots by default", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Application error",
        description: "Users cannot log in",
        priority: "2",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);

      const tool = createTriageTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        caseNumber: "SCS0001234",
        // includeScreenshots not specified - defaults to false
      });

      expect(result.success).toBe(true);
      expect(result.case_number).toBe("SCS0001234");
      expect(result.classification).toBeDefined();
      expect(serviceNowClient.getAttachments).not.toHaveBeenCalled();
      expect(result._attachmentBlocks).toBeUndefined();
    });
  });

  describe("triage with screenshots", () => {
    it("should NOT fetch screenshots when feature flag is disabled", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "UI error",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      (config as any).enableMultimodalToolResults = false;

      const tool = createTriageTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        caseNumber: "SCS0001234",
        includeScreenshots: true, // Requested but disabled
      });

      expect(result.success).toBe(true);
      expect(serviceNowClient.getAttachments).not.toHaveBeenCalled();
      expect(result._attachmentBlocks).toBeUndefined();
    });

    it("should fetch and include screenshots when enabled", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "UI error with screenshot",
        description: "Button not working",
      };

      const mockAttachments = [
        {
          sys_id: "attach_1",
          file_name: "ui-error.png",
          content_type: "image/png",
          size_bytes: 120000,
          download_url: "https://...",
        },
        {
          sys_id: "attach_2",
          file_name: "console-log.png",
          content_type: "image/png",
          size_bytes: 95000,
          download_url: "https://...",
        },
      ];

      const mockImageBuffer = Buffer.from("screenshot data");

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      vi.mocked(serviceNowClient.getAttachments).mockResolvedValue(mockAttachments);
      vi.mocked(serviceNowClient.downloadAttachment).mockResolvedValue(mockImageBuffer);
      (config as any).enableMultimodalToolResults = true;

      const tool = createTriageTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        caseNumber: "SCS0001234",
        includeScreenshots: true,
      });

      expect(result.success).toBe(true);
      expect(result.classification).toBeDefined();
      expect(serviceNowClient.getAttachments).toHaveBeenCalledWith(
        "sn_customerservice_case",
        "case_123",
        3
      );
      expect(serviceNowClient.downloadAttachment).toHaveBeenCalledTimes(2);
      expect(result._attachmentBlocks).toBeDefined();
      expect(result._attachmentBlocks).toHaveLength(2);
      expect(result._attachmentCount).toBe(2);
    });

    it("should handle screenshot fetch failures without breaking triage", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Case",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      vi.mocked(serviceNowClient.getAttachments).mockRejectedValue(new Error("Attachment API failed"));
      (config as any).enableMultimodalToolResults = true;

      const tool = createTriageTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      // Should still complete triage successfully
      const result = await tool.execute({
        caseNumber: "SCS0001234",
        includeScreenshots: true,
      });

      expect(result.success).toBe(true);
      expect(result.classification).toBeDefined();
      // Screenshots failed but triage succeeded
      expect(result._attachmentBlocks).toBeUndefined();
    });

    it("should limit screenshots to config maximum", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Case with many screenshots",
      };

      // Return 10 attachments
      const mockAttachments = Array.from({ length: 10 }, (_, i) => ({
        sys_id: `attach_${i}`,
        file_name: `screenshot${i}.png`,
        content_type: "image/png",
        size_bytes: 50000,
        download_url: "https://...",
      }));

      const mockImageBuffer = Buffer.from("screenshot");

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      vi.mocked(serviceNowClient.getAttachments).mockResolvedValue(mockAttachments);
      vi.mocked(serviceNowClient.downloadAttachment).mockResolvedValue(mockImageBuffer);
      (config as any).enableMultimodalToolResults = true;
      (config as any).maxImageAttachmentsPerTool = 3;

      const tool = createTriageTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        caseNumber: "SCS0001234",
        includeScreenshots: true,
      });

      // Should only process 3 screenshots (config limit)
      expect(serviceNowClient.downloadAttachment).toHaveBeenCalledTimes(3);
      expect(result._attachmentBlocks).toHaveLength(3);
    });
  });
});
