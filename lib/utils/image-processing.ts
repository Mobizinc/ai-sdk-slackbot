/**
 * Image Processing Utility
 *
 * Handles image optimization and resizing for Anthropic Claude API.
 * Images are optimized to meet token limits while preserving quality for visual analysis.
 */

import sharp from "sharp";

export interface OptimizedImage {
  data: string; // base64 encoded image
  media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  size_bytes: number;
  was_optimized: boolean;
  original_size_bytes?: number;
}

/**
 * Optimize an image for Claude API consumption
 *
 * Strategy:
 * 1. If image is under size limit, return as-is
 * 2. Resize to max 1920x1920 (preserving aspect ratio)
 * 3. Convert to JPEG and iteratively reduce quality until under limit
 * 4. If still too large at quality 20, reject (very rare)
 *
 * @param imageBuffer Raw image data
 * @param contentType Original MIME type
 * @param maxSizeBytes Maximum size in bytes (default: 5MB)
 * @returns Optimized image with base64 data
 */
export async function optimizeImageForClaude(
  imageBuffer: Buffer,
  contentType: string,
  maxSizeBytes: number = 5 * 1024 * 1024 // 5MB default
): Promise<OptimizedImage> {
  const originalSize = imageBuffer.length;

  // If already under limit and in supported format, return as-is
  const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (originalSize <= maxSizeBytes && supportedTypes.includes(contentType)) {
    return {
      data: imageBuffer.toString("base64"),
      media_type: contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      size_bytes: originalSize,
      was_optimized: false,
      original_size_bytes: originalSize,
    };
  }

  // Need to optimize - start with resize
  let quality = 80;
  let optimized = await sharp(imageBuffer)
    .resize(1920, 1920, {
      fit: "inside", // Preserve aspect ratio
      withoutEnlargement: true, // Don't upscale small images
    })
    .jpeg({ quality, mozjpeg: true }) // Use mozjpeg for better compression
    .toBuffer();

  // Iteratively reduce quality if still too large
  while (optimized.length > maxSizeBytes && quality > 20) {
    quality -= 10;
    optimized = await sharp(imageBuffer)
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  // If still too large at quality 20, throw error
  if (optimized.length > maxSizeBytes) {
    throw new Error(
      `Image too large to optimize: ${originalSize} bytes. Even at lowest quality (20), result is ${optimized.length} bytes (limit: ${maxSizeBytes})`
    );
  }

  return {
    data: optimized.toString("base64"),
    media_type: "image/jpeg", // Always JPEG after optimization
    size_bytes: optimized.length,
    was_optimized: true,
    original_size_bytes: originalSize,
  };
}

/**
 * Validate if an image format is supported by Claude
 */
export function isSupportedImageFormat(contentType: string): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(contentType);
}

/**
 * Get estimated token count for an image
 * Based on Anthropic's documentation: ~1400 tokens per 1024x768 image
 *
 * Rough formula: (width * height) / 750
 */
export async function estimateImageTokens(imageBuffer: Buffer): Promise<number> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Rough estimate based on pixel count
  const pixels = width * height;
  return Math.ceil(pixels / 750);
}

/**
 * Batch optimize multiple images
 * Returns successfully optimized images and logs errors for failed ones
 */
export async function optimizeBatch(
  images: Array<{ buffer: Buffer; contentType: string; fileName: string }>,
  maxSizeBytes?: number
): Promise<{
  successful: Array<OptimizedImage & { fileName: string }>;
  failed: Array<{ fileName: string; error: string }>;
}> {
  const successful: Array<OptimizedImage & { fileName: string }> = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const image of images) {
    try {
      const optimized = await optimizeImageForClaude(
        image.buffer,
        image.contentType,
        maxSizeBytes
      );
      successful.push({ ...optimized, fileName: image.fileName });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ImageProcessing] Failed to optimize ${image.fileName}:`, errorMessage);
      failed.push({ fileName: image.fileName, error: errorMessage });
    }
  }

  return { successful, failed };
}
