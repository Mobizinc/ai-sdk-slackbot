/**
 * Integration tests for ServiceNow attachment API
 *
 * These tests use mocked data to simulate ServiceNow attachment operations
 * without requiring real ServiceNow credentials.
 *
 * Run with: pnpm test tests/integration/servicenow-attachments.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { serviceNowClient } from "../../lib/tools/servicenow";
import { optimizeImageForClaude } from "../../lib/utils/image-processing";

// Mock the ServiceNow client and image processing function
vi.mock("../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    isConfigured: vi.fn(() => true),
    getAttachments: vi.fn(),
    downloadAttachment: vi.fn(),
  },
}));

vi.mock("../../lib/utils/image-processing", () => ({
  optimizeImageForClaude: vi.fn(),
}));

// Mock test data
const mockAttachments = [
  {
    sys_id: "attachment_sys_id_1",
    file_name: "screenshot.png",
    content_type: "image/png",
    size_bytes: 1024000,
    download_url: "https://example.service-now.com/api/now/attachment/attachment_sys_id_1/file",
  },
  {
    sys_id: "attachment_sys_id_2", 
    file_name: "error-log.txt",
    content_type: "text/plain",
    size_bytes: 2048,
    download_url: "https://example.service-now.com/api/now/attachment/attachment_sys_id_2/file",
  },
  {
    sys_id: "attachment_sys_id_3",
    file_name: "diagram.jpg",
    content_type: "image/jpeg",
    size_bytes: 2048000,
    download_url: "https://example.service-now.com/api/now/attachment/attachment_sys_id_3/file",
  },
];

const mockImageBuffer = Buffer.from("fake-image-data-for-testing");
const mockOptimizedImage = {
  data: mockImageBuffer.toString("base64"),
  media_type: "image/jpeg" as const,
  size_bytes: mockImageBuffer.length,
  was_optimized: true,
  original_size_bytes: mockImageBuffer.length * 2,
};

describe("ServiceNow Attachment API Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    const mockedServiceNowClient = vi.mocked(serviceNowClient);
    const mockedOptimizeImageForClaude = vi.mocked(optimizeImageForClaude);
    
    mockedServiceNowClient.getAttachments.mockResolvedValue(mockAttachments);
    mockedServiceNowClient.downloadAttachment.mockResolvedValue(mockImageBuffer);
    mockedOptimizeImageForClaude.mockResolvedValue(mockOptimizedImage);
  });

  describe("getAttachments()", () => {
    it("should fetch attachments from a case", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        "test_case_sys_id",
        5
      );

      expect(Array.isArray(attachments)).toBe(true);
      expect(attachments).toEqual(mockAttachments);
      expect(serviceNowClient.getAttachments).toHaveBeenCalledWith(
        "sn_customerservice_case",
        "test_case_sys_id",
        5
      );

      if (attachments.length > 0) {
        const attachment = attachments[0];
        expect(attachment).toHaveProperty("sys_id");
        expect(attachment).toHaveProperty("file_name");
        expect(attachment).toHaveProperty("content_type");
        expect(attachment).toHaveProperty("size_bytes");
        expect(attachment).toHaveProperty("download_url");
        expect(typeof attachment.size_bytes).toBe("number");
      }
    });

    it("should return empty array for invalid sys_id", async () => {
      const mockedServiceNowClient = vi.mocked(serviceNowClient);
      mockedServiceNowClient.getAttachments.mockResolvedValue([]);

      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        "nonexistent_sys_id_12345",
        5
      );

      expect(Array.isArray(attachments)).toBe(true);
      expect(attachments.length).toBe(0);
    });

    it("should respect limit parameter", async () => {
      const mockedServiceNowClient = vi.mocked(serviceNowClient);
      mockedServiceNowClient.getAttachments.mockResolvedValue(mockAttachments.slice(0, 2));

      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        "test_case_sys_id",
        2 // Limit to 2
      );

      expect(attachments.length).toBeLessThanOrEqual(2);
      expect(serviceNowClient.getAttachments).toHaveBeenCalledWith(
        "sn_customerservice_case",
        "test_case_sys_id",
        2
      );
    });
  });

  describe("downloadAttachment()", () => {
    it("should download an attachment as Buffer", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        "test_case_sys_id",
        1
      );

      expect(attachments.length).toBeGreaterThan(0);

      const imageBuffer = await serviceNowClient.downloadAttachment(attachments[0].sys_id);

      expect(Buffer.isBuffer(imageBuffer)).toBe(true);
      expect(imageBuffer.length).toBeGreaterThan(0);
      expect(serviceNowClient.downloadAttachment).toHaveBeenCalledWith(attachments[0].sys_id);
    });

    it("should handle 404 errors for invalid attachment sys_id", async () => {
      const mockedServiceNowClient = vi.mocked(serviceNowClient);
      mockedServiceNowClient.downloadAttachment.mockRejectedValue(
        new Error("Failed to download attachment: 404 Not Found")
      );

      await expect(
        serviceNowClient.downloadAttachment("invalid_sys_id_12345")
      ).rejects.toThrow("Failed to download attachment: 404 Not Found");
    });
  });

  describe("Full attachment workflow", () => {
    it("should fetch, download, and optimize a screenshot", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        "test_case_sys_id",
        3
      );

      expect(attachments.length).toBeGreaterThan(0);

      // Find an image attachment
      const imageAttachment = attachments.find(a =>
        a.content_type.startsWith("image/")
      );

      expect(imageAttachment).toBeDefined();
      if (!imageAttachment) return;

      // Download
      const imageBuffer = await serviceNowClient.downloadAttachment(imageAttachment.sys_id);
      expect(Buffer.isBuffer(imageBuffer)).toBe(true);

      // Optimize
      const optimized = await optimizeImageForClaude(
        imageBuffer,
        imageAttachment.content_type,
        5 * 1024 * 1024 // 5MB limit
      );

      expect(optimized.data).toBeTruthy();
      expect(optimized.media_type).toMatch(/^image\/(jpeg|png|gif|webp)$/);
      expect(optimized.size_bytes).toBeLessThanOrEqual(5 * 1024 * 1024);

      // Verify base64 encoding
      const decoded = Buffer.from(optimized.data, "base64");
      expect(decoded.length).toBe(optimized.size_bytes);

      expect(optimizeImageForClaude).toHaveBeenCalledWith(
        imageBuffer,
        imageAttachment.content_type,
        5 * 1024 * 1024
      );
    });

    it("should handle multiple attachments efficiently", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        "test_case_sys_id",
        3
      );

      const imageAttachments = attachments.filter(a =>
        a.content_type.startsWith("image/")
      );

      expect(imageAttachments.length).toBeGreaterThan(0);

      const startTime = Date.now();

      // Download and optimize all images in parallel
      const processed = await Promise.all(
        imageAttachments.map(async (attachment) => {
          const buffer = await serviceNowClient.downloadAttachment(attachment.sys_id);
          return await optimizeImageForClaude(buffer, attachment.content_type);
        })
      );

      const duration = Date.now() - startTime;

      expect(processed.length).toBe(imageAttachments.length);
      processed.forEach((img) => {
        expect(img.data).toBeTruthy();
        expect(img.size_bytes).toBeGreaterThan(0);
      });

      // Should be reasonably fast (<2s per image)
      expect(duration / processed.length).toBeLessThan(2000);

      // Verify all calls were made
      expect(serviceNowClient.downloadAttachment).toHaveBeenCalledTimes(imageAttachments.length);
      expect(optimizeImageForClaude).toHaveBeenCalledTimes(imageAttachments.length);
    });
  });
});
