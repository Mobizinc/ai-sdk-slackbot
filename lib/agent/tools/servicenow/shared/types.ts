/**
 * Shared Types for ServiceNow Tools
 *
 * Common TypeScript interfaces and types used across all ServiceNow modular tools.
 */

/**
 * Standard tool result format for consistent error handling
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  display?: string;
  _attachmentBlocks?: unknown[];
  _attachmentCount?: number;
}

/**
 * Error codes for ServiceNow tools
 */
export const ServiceNowErrorCodes = {
  NOT_FOUND: "RECORD_NOT_FOUND",
  FETCH_ERROR: "FETCH_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  ATTACHMENT_ERROR: "ATTACHMENT_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

/**
 * Helper to create error results
 */
export function createErrorResult(
  code: string,
  message: string,
  details?: unknown
): ToolResult<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Helper to create success results
 */
export function createSuccessResult<T>(
  data: T,
  attachmentBlocks?: unknown[],
  display?: string
): ToolResult<T> {
  return {
    success: true,
    data,
    display,
    _attachmentBlocks: attachmentBlocks,
    _attachmentCount: attachmentBlocks?.length || 0,
  };
}
