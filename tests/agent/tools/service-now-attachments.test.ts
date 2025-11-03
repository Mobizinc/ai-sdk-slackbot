/**
 * Unit tests for ServiceNow tool attachment handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServiceNowTool } from "../../../lib/agent/tools/service-now";
import { serviceNowClient } from "../../../lib/tools/servicenow";
import { config } from "../../../lib/config";

// Mock dependencies
vi.mock("../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    isConfigured: vi.fn(),
    getCase: vi.fn(),
    getIncident: vi.fn(),
    getAttachments: vi.fn(),
    downloadAttachment: vi.fn(),
  },
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
    data: "optimized_base64_data",
    media_type: "image/jpeg",
    size_bytes: 50000,
    was_optimized: true,
    original_size_bytes: 150000,
  }),
  isSupportedImageFormat: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn().mockReturnValue({}),
}));

describe("ServiceNow Tool - Attachment Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serviceNowClient.isConfigured).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getCase with includeAttachments", () => {
    it("should fetch case without attachments by default", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Test case",
        description: "Test description",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);

      const tool = createServiceNowTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        action: "getCase",
        number: "SCS0001234",
        // includeAttachments not specified - should default to false
      });

      expect(result).toMatchObject({
        summary: expect.any(String),
        rawData: expect.objectContaining({
          case: mockCase,
        }),
      });
      expect(serviceNowClient.getAttachments).not.toHaveBeenCalled();
      expect(result._attachmentBlocks).toBeUndefined();
    });

    it("should NOT fetch attachments when feature flag is disabled", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Test case",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      (config as any).enableMultimodalToolResults = false;

      const tool = createServiceNowTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        action: "getCase",
        number: "SCS0001234",
        includeAttachments: true, // Requested but feature disabled
      });

      expect(result).toMatchObject({
        summary: expect.any(String),
        rawData: expect.objectContaining({
          case: mockCase,
        }),
      });
      expect(serviceNowClient.getAttachments).not.toHaveBeenCalled();
    });

    it("should fetch and return attachments when enabled", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Test case with screenshot",
      };

      const mockAttachments = [
        {
          sys_id: "attach_1",
          file_name: "error-screenshot.png",
          content_type: "image/png",
          size_bytes: 150000,
          download_url: "https://instance.service-now.com/...",
        },
      ];

      const mockImageBuffer = Buffer.from("fake image data");

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      vi.mocked(serviceNowClient.getAttachments).mockResolvedValue(mockAttachments);
      vi.mocked(serviceNowClient.downloadAttachment).mockResolvedValue(mockImageBuffer);
      (config as any).enableMultimodalToolResults = true;

      const tool = createServiceNowTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        action: "getCase",
        number: "SCS0001234",
        includeAttachments: true,
      });

      expect(serviceNowClient.getCase).toHaveBeenCalledWith("SCS0001234", expect.anything());
      expect(serviceNowClient.getAttachments).toHaveBeenCalledWith(
        "sn_customerservice_case",
        "case_123",
        3 // default limit
      );
      expect(serviceNowClient.downloadAttachment).toHaveBeenCalledWith("attach_1");

      expect(result.rawData?.case).toEqual(mockCase);
      expect(result._attachmentBlocks).toBeDefined();
      expect(result._attachmentBlocks).toHaveLength(1);
      expect(result._attachmentBlocks[0].type).toBe("image");
      expect(result._attachmentCount).toBe(1);
    });

    it("should respect maxAttachments parameter", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Case with many screenshots",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      vi.mocked(serviceNowClient.getAttachments).mockResolvedValue([]);
      (config as any).enableMultimodalToolResults = true;

      const tool = createServiceNowTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      await tool.execute({
        action: "getCase",
        number: "SCS0001234",
        includeAttachments: true,
        maxAttachments: 5,
      });

      // Should request up to 5, but config caps at 3
      expect(serviceNowClient.getAttachments).toHaveBeenCalledWith(
        "sn_customerservice_case",
        "case_123",
        3 // Capped by config.maxImageAttachmentsPerTool
      );
    });

    it("should handle cases with no attachments gracefully", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Case without attachments",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      vi.mocked(serviceNowClient.getAttachments).mockResolvedValue([]);
      (config as any).enableMultimodalToolResults = true;

      const tool = createServiceNowTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        action: "getCase",
        number: "SCS0001234",
        includeAttachments: true,
      });

      expect(result).toMatchObject({
        summary: expect.any(String),
        rawData: expect.objectContaining({
          case: mockCase,
        }),
      });
      expect(result._attachmentBlocks).toBeUndefined();
    });

    it("should handle attachment fetch errors gracefully", async () => {
      const mockCase = {
        sys_id: "case_123",
        number: "SCS0001234",
        short_description: "Case",
      };

      vi.mocked(serviceNowClient.getCase).mockResolvedValue(mockCase as any);
      vi.mocked(serviceNowClient.getAttachments).mockRejectedValue(new Error("API error"));
      (config as any).enableMultimodalToolResults = true;

      const tool = createServiceNowTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      // Should not throw, should return case without attachments
      const result = await tool.execute({
        action: "getCase",
        number: "SCS0001234",
        includeAttachments: true,
      });

      expect(result.rawData.case).toEqual(mockCase);
      // Attachment processing failed, so no blocks
      expect(result._attachmentBlocks).toBeUndefined();
    });
  });

  describe("getIncident with includeAttachments", () => {
    it("should fetch incident with attachments when enabled", async () => {
      const mockIncident = {
        sys_id: "inc_123",
        number: "INC0001234",
        short_description: "Test incident",
        state: "In Progress",
        url: "https://...",
      };

      const mockAttachments = [
        {
          sys_id: "attach_1",
          file_name: "error.png",
          content_type: "image/png",
          size_bytes: 80000,
          download_url: "https://...",
        },
      ];

      const mockImageBuffer = Buffer.from("image data");

      vi.mocked(serviceNowClient.getIncident).mockResolvedValue(mockIncident as any);
      vi.mocked(serviceNowClient.getAttachments).mockResolvedValue(mockAttachments);
      vi.mocked(serviceNowClient.downloadAttachment).mockResolvedValue(mockImageBuffer);
      (config as any).enableMultimodalToolResults = true;

      const tool = createServiceNowTool({
        caseNumbers: [],
        messages: [],
        updateStatus: vi.fn(),
        options: {},
      });

      const result = await tool.execute({
        action: "getIncident",
        number: "INC0001234",
        includeAttachments: true,
      });

      expect(serviceNowClient.getAttachments).toHaveBeenCalledWith(
        "incident",
        "inc_123",
        3
      );
      expect(result.rawData.incident).toEqual(mockIncident);
      expect(result._attachmentBlocks).toBeDefined();
      expect(result._attachmentCount).toBe(1);
    });
  });
});
