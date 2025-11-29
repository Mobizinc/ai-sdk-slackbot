/**
 * Attachment Processing Utilities
 *
 * Shared utilities for fetching and processing ServiceNow attachments
 * for Claude consumption across all ServiceNow tools.
 */

import type { ContentBlock } from "../../../../services/anthropic-chat";
import { serviceNowClient } from "../../../../tools/servicenow";
import {
  optimizeImageForClaude,
  isSupportedImageFormat,
} from "../../../../utils/image-processing";
import { getEnableMultimodalToolResults, getMaxImageAttachmentsPerTool, getMaxImageSizeBytes } from "../../../../config/helpers";

/**
 * Fetch and process attachments from ServiceNow for Claude consumption
 *
 * @param tableName - ServiceNow table name (e.g., "incident", "sn_customerservice_case")
 * @param recordSysId - Record sys_id to fetch attachments for
 * @param includeAttachments - Whether to include attachments (respects global config)
 * @param maxAttachments - Maximum number of attachments to fetch (default: 3, max: 5)
 * @param attachmentTypes - MIME types to filter (default: images only)
 * @returns Array of Claude-compatible content blocks
 */
export async function fetchAttachments(
  tableName: string,
  recordSysId: string,
  includeAttachments?: boolean,
  maxAttachments?: number,
  attachmentTypes?: string[]
): Promise<ContentBlock[]> {
  // Check if multimodal is enabled globally and requested
  if (!getEnableMultimodalToolResults() || !includeAttachments) {
    return [];
  }

  try {
    const attachmentLimit = Math.min(
      maxAttachments ?? getMaxImageAttachmentsPerTool(),
      getMaxImageAttachmentsPerTool()
    );

    // Fetch attachment metadata
    const attachments = await serviceNowClient.getAttachments(
      tableName,
      recordSysId,
      attachmentLimit
    );

    if (attachments.length === 0) {
      return [];
    }

    // Filter by type (default to images only)
    const typeFilter =
      attachmentTypes && attachmentTypes.length > 0
        ? attachmentTypes
        : ["image/jpeg", "image/png", "image/gif", "image/webp"];

    const filteredAttachments = attachments.filter((a) =>
      typeFilter.some((type) => a.content_type.startsWith(type.split("/")[0]))
    );

    const contentBlocks: ContentBlock[] = [];

    // Download and optimize images
    for (const attachment of filteredAttachments.slice(0, attachmentLimit)) {
      try {
        // Skip if not a supported image format
        if (!isSupportedImageFormat(attachment.content_type)) {
          console.log(
            `[Attachments] Skipping unsupported format: ${attachment.content_type} (${attachment.file_name})`
          );
          continue;
        }

        // Download the image
        const imageBuffer = await serviceNowClient.downloadAttachment(
          attachment.sys_id
        );

        // Optimize for Claude
        const optimized = await optimizeImageForClaude(
          imageBuffer,
          attachment.content_type,
          getMaxImageSizeBytes()
        );

        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: optimized.media_type,
            data: optimized.data,
          },
        });

        console.log(
          `[Attachments] Processed ${attachment.file_name}: ` +
            `${optimized.size_bytes} bytes (${
              optimized.was_optimized ? "optimized" : "original"
            })`
        );
      } catch (error) {
        console.error(
          `[Attachments] Failed to process ${attachment.file_name}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue with other attachments
      }
    }

    return contentBlocks;
  } catch (error) {
    console.error("[Attachments] Failed to fetch attachments:", error);
    return []; // Return empty array, don't fail the entire tool call
  }
}

/**
 * Helper to extract value from ServiceNow reference field
 * Handles both string and {value, display_value} object formats
 */
export function extractReference(field: unknown): string | undefined {
  if (!field) return undefined;
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    const ref = field as { value?: unknown; display_value?: unknown };
    const value = ref.value;
    const display = ref.display_value;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (typeof display === "string" && display.trim().length > 0) {
      return display;
    }
  }
  return undefined;
}
