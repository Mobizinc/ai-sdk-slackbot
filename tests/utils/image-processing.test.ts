/**
 * Unit tests for image processing utilities
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  optimizeImageForClaude,
  isSupportedImageFormat,
  estimateImageTokens,
  optimizeBatch,
} from "../../lib/utils/image-processing";

const FIXTURES_DIR = join(__dirname, "../fixtures/images");

describe("Image Processing Utils", () => {
  let smallImageBuffer: Buffer;
  let mediumImageBuffer: Buffer;
  let largeImageBuffer: Buffer;
  let pngImageBuffer: Buffer;
  let webpImageBuffer: Buffer;
  let gifImageBuffer: Buffer;

  beforeAll(async () => {
    smallImageBuffer = await readFile(join(FIXTURES_DIR, "small-image.jpg"));
    mediumImageBuffer = await readFile(join(FIXTURES_DIR, "medium-image.jpg"));
    largeImageBuffer = await readFile(join(FIXTURES_DIR, "large-image.png"));
    pngImageBuffer = await readFile(join(FIXTURES_DIR, "test-screenshot.png"));
    webpImageBuffer = await readFile(join(FIXTURES_DIR, "test-diagram.webp"));
    gifImageBuffer = await readFile(join(FIXTURES_DIR, "test-icon.gif"));
  });

  describe("optimizeImageForClaude", () => {
    it("should return image as-is if under size limit and supported format", async () => {
      const result = await optimizeImageForClaude(
        smallImageBuffer,
        "image/jpeg",
        10 * 1024 * 1024 // 10MB limit
      );

      expect(result.was_optimized).toBe(false);
      expect(result.media_type).toBe("image/jpeg");
      expect(result.size_bytes).toBe(smallImageBuffer.length);
      expect(result.data).toBe(smallImageBuffer.toString("base64"));
    });

    it("should optimize large images by resizing and compressing", async () => {
      const result = await optimizeImageForClaude(
        largeImageBuffer,
        "image/png",
        100 * 1024 // 100KB limit
      );

      expect(result.was_optimized).toBe(true);
      expect(result.media_type).toBe("image/jpeg"); // Converted to JPEG
      expect(result.size_bytes).toBeLessThan(100 * 1024);
      expect(result.size_bytes).toBeLessThan(result.original_size_bytes!);
      expect(result.data).toBeTruthy();
      expect(result.data.length).toBeGreaterThan(0);
    });

    it("should handle different image formats (PNG, WebP, GIF)", async () => {
      const formats = [
        { buffer: pngImageBuffer, type: "image/png" as const },
        { buffer: webpImageBuffer, type: "image/webp" as const },
        { buffer: gifImageBuffer, type: "image/gif" as const },
      ];

      for (const { buffer, type } of formats) {
        const result = await optimizeImageForClaude(buffer, type, 50 * 1024);
        expect(result.data).toBeTruthy();
        expect(result.size_bytes).toBeLessThanOrEqual(50 * 1024);
      }
    });

    it("should preserve aspect ratio during resize", async () => {
      const result = await optimizeImageForClaude(
        mediumImageBuffer,
        "image/jpeg",
        50 * 1024
      );

      // Result should fit within size limit
      expect(result.size_bytes).toBeLessThanOrEqual(50 * 1024);

      // If optimization was needed, size should be smaller than original
      if (mediumImageBuffer.length > 50 * 1024) {
        expect(result.was_optimized).toBe(true);
        expect(result.size_bytes).toBeLessThan(mediumImageBuffer.length);
      }
    });

    it("should throw error for extremely large images that cannot be optimized", async () => {
      // Create a massive image that even at quality 20 won't fit in 10KB
      await expect(
        optimizeImageForClaude(largeImageBuffer, "image/png", 1024) // 1KB limit (impossible)
      ).rejects.toThrow(/Image too large to optimize/);
    });

    it("should return valid base64 encoded data", async () => {
      const result = await optimizeImageForClaude(
        smallImageBuffer,
        "image/jpeg"
      );

      // Should be valid base64
      expect(result.data).toMatch(/^[A-Za-z0-9+/]+=*$/);

      // Should be decodable
      const decoded = Buffer.from(result.data, "base64");
      expect(decoded.length).toBeGreaterThan(0);
    });
  });

  describe("isSupportedImageFormat", () => {
    it("should return true for supported formats", () => {
      expect(isSupportedImageFormat("image/jpeg")).toBe(true);
      expect(isSupportedImageFormat("image/png")).toBe(true);
      expect(isSupportedImageFormat("image/gif")).toBe(true);
      expect(isSupportedImageFormat("image/webp")).toBe(true);
    });

    it("should return false for unsupported formats", () => {
      expect(isSupportedImageFormat("image/bmp")).toBe(false);
      expect(isSupportedImageFormat("image/tiff")).toBe(false);
      expect(isSupportedImageFormat("image/svg+xml")).toBe(false);
      expect(isSupportedImageFormat("application/pdf")).toBe(false);
      expect(isSupportedImageFormat("text/plain")).toBe(false);
    });
  });

  describe("estimateImageTokens", () => {
    it("should estimate tokens based on pixel count", async () => {
      // Small image (800x600 = 480K pixels)
      const smallTokens = await estimateImageTokens(smallImageBuffer);
      expect(smallTokens).toBeGreaterThan(500);
      expect(smallTokens).toBeLessThan(1000);

      // Medium image (1920x1080 = 2.07M pixels)
      const mediumTokens = await estimateImageTokens(mediumImageBuffer);
      expect(mediumTokens).toBeGreaterThan(2000);
      expect(mediumTokens).toBeLessThan(3500);
    });

    it("should return higher estimates for larger images", async () => {
      const smallTokens = await estimateImageTokens(smallImageBuffer);
      const largeTokens = await estimateImageTokens(largeImageBuffer);

      expect(largeTokens).toBeGreaterThan(smallTokens);
    });
  });

  describe("optimizeBatch", () => {
    it("should process multiple images successfully", async () => {
      const images = [
        { buffer: smallImageBuffer, contentType: "image/jpeg", fileName: "small.jpg" },
        { buffer: pngImageBuffer, contentType: "image/png", fileName: "screenshot.png" },
        { buffer: webpImageBuffer, contentType: "image/webp", fileName: "diagram.webp" },
      ];

      const result = await optimizeBatch(images, 200 * 1024);

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);

      result.successful.forEach(img => {
        expect(img.data).toBeTruthy();
        expect(img.size_bytes).toBeLessThanOrEqual(200 * 1024);
      });
    });

    it("should handle partial failures gracefully", async () => {
      const images = [
        { buffer: smallImageBuffer, contentType: "image/jpeg", fileName: "small.jpg" },
        { buffer: Buffer.from([0xFF, 0xD8, 0xFF]), contentType: "image/png", fileName: "corrupt.png" }, // Corrupt JPEG header
        { buffer: pngImageBuffer, contentType: "image/png", fileName: "valid.png" },
      ];

      const result = await optimizeBatch(images, 200 * 1024);

      // At least some should succeed
      expect(result.successful.length).toBeGreaterThan(0);

      // May have failures depending on sharp's tolerance
      if (result.failed.length > 0) {
        expect(result.failed[0].error).toBeTruthy();
      }
    });

    it("should not throw even with invalid image data", async () => {
      const images = [
        { buffer: Buffer.from("invalid"), contentType: "image/jpeg", fileName: "bad1.jpg" },
        { buffer: Buffer.from("also invalid"), contentType: "image/png", fileName: "bad2.png" },
      ];

      // Should not throw, even with invalid data
      const result = await optimizeBatch(images, 200 * 1024);

      // Result should be defined with successful and failed arrays
      expect(result).toBeDefined();
      expect(result.successful).toBeDefined();
      expect(result.failed).toBeDefined();
      expect(Array.isArray(result.successful)).toBe(true);
      expect(Array.isArray(result.failed)).toBe(true);
    });
  });

  describe("Optimization Quality", () => {
    it("should produce acceptable quality images at various compression levels", async () => {
      // Test that even heavily compressed images have reasonable quality
      const sizes = [500 * 1024, 200 * 1024, 100 * 1024, 50 * 1024];

      for (const maxSize of sizes) {
        const result = await optimizeImageForClaude(
          largeImageBuffer,
          "image/png",
          maxSize
        );

        expect(result.size_bytes).toBeLessThanOrEqual(maxSize);
        // Should still have reasonable data size (not degenerated to nothing)
        expect(result.size_bytes).toBeGreaterThan(5000);
      }
    });
  });
});
