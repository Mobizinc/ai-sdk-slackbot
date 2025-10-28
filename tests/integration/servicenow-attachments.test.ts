/**
 * Integration tests for ServiceNow attachment API
 *
 * These tests require a real ServiceNow instance to be configured.
 * Set TEST_CASE_WITH_ATTACHMENTS_SYS_ID in .env.test to use a test case with screenshots.
 *
 * Run with: pnpm test:integration tests/integration/servicenow-attachments.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { serviceNowClient } from "../../lib/tools/servicenow";
import { optimizeImageForClaude } from "../../lib/utils/image-processing";

const TEST_CASE_SYS_ID = process.env.TEST_CASE_WITH_ATTACHMENTS_SYS_ID;
const TEST_CASE_NUMBER = process.env.TEST_CASE_WITH_ATTACHMENTS;

// Skip all tests if ServiceNow is not configured
const describeIfConfigured = serviceNowClient.isConfigured() && TEST_CASE_SYS_ID
  ? describe
  : describe.skip;

describeIfConfigured("ServiceNow Attachment API Integration", () => {
  beforeAll(() => {
    if (!serviceNowClient.isConfigured()) {
      console.warn("ServiceNow not configured - skipping integration tests");
      return;
    }
    if (!TEST_CASE_SYS_ID) {
      console.warn("TEST_CASE_WITH_ATTACHMENTS_SYS_ID not set - skipping tests");
      return;
    }
  });

  describe("getAttachments()", () => {
    it("should fetch attachments from a real case", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        TEST_CASE_SYS_ID!,
        5
      );

      expect(Array.isArray(attachments)).toBe(true);

      if (attachments.length > 0) {
        const attachment = attachments[0];
        expect(attachment).toHaveProperty("sys_id");
        expect(attachment).toHaveProperty("file_name");
        expect(attachment).toHaveProperty("content_type");
        expect(attachment).toHaveProperty("size_bytes");
        expect(attachment).toHaveProperty("download_url");
        expect(typeof attachment.size_bytes).toBe("number");
      }
    }, 10000);

    it("should return empty array for invalid sys_id", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        "nonexistent_sys_id_12345",
        5
      );

      expect(Array.isArray(attachments)).toBe(true);
      // May be empty or error depending on ServiceNow config
    }, 10000);

    it("should respect limit parameter", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        TEST_CASE_SYS_ID!,
        2 // Limit to 2
      );

      expect(attachments.length).toBeLessThanOrEqual(2);
    }, 10000);
  });

  describe("downloadAttachment()", () => {
    it("should download a real attachment as Buffer", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        TEST_CASE_SYS_ID!,
        1
      );

      if (attachments.length === 0) {
        console.warn("No attachments found for test case - skipping download test");
        return;
      }

      const imageBuffer = await serviceNowClient.downloadAttachment(attachments[0].sys_id);

      expect(Buffer.isBuffer(imageBuffer)).toBe(true);
      expect(imageBuffer.length).toBeGreaterThan(0);
      expect(imageBuffer.length).toBe(attachments[0].size_bytes);
    }, 15000);

    it("should handle 404 errors for invalid attachment sys_id", async () => {
      await expect(
        serviceNowClient.downloadAttachment("invalid_sys_id_12345")
      ).rejects.toThrow();
    }, 10000);
  });

  describe("Full attachment workflow", () => {
    it("should fetch, download, and optimize a real screenshot", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        TEST_CASE_SYS_ID!,
        3
      );

      if (attachments.length === 0) {
        console.warn("No attachments found - skipping full workflow test");
        return;
      }

      // Find an image attachment
      const imageAttachment = attachments.find(a =>
        a.content_type.startsWith("image/")
      );

      if (!imageAttachment) {
        console.warn("No image attachments found - skipping");
        return;
      }

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

      console.log(`✓ Processed ${imageAttachment.file_name}:`);
      console.log(`  Original: ${imageAttachment.size_bytes} bytes`);
      console.log(`  Optimized: ${optimized.size_bytes} bytes`);
      console.log(`  Was optimized: ${optimized.was_optimized}`);
    }, 20000);

    it("should handle multiple attachments efficiently", async () => {
      const attachments = await serviceNowClient.getAttachments(
        "sn_customerservice_case",
        TEST_CASE_SYS_ID!,
        3
      );

      const imageAttachments = attachments.filter(a =>
        a.content_type.startsWith("image/")
      );

      if (imageAttachments.length === 0) {
        console.warn("No image attachments - skipping batch test");
        return;
      }

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

      console.log(`✓ Processed ${processed.length} images in ${duration}ms`);
      console.log(`  Average: ${(duration / processed.length).toFixed(0)}ms per image`);

      // Should be reasonably fast (<2s per image)
      expect(duration / processed.length).toBeLessThan(2000);
    }, 30000);
  });
});
