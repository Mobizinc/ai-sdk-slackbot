/**
 * Shared Tool Utilities and Types
 *
 * Common utilities and type definitions used across all agent tools.
 * Extracted from factory.ts to support modular tool architecture.
 *
 * Now uses Anthropic-native tool helpers instead of AI SDK.
 */

import { createTool as anthropicCreateTool } from "./anthropic-tools";
import type { CoreMessage } from "./anthropic-tools";
import { createAzureSearchService } from "../../services/azure-search";
import type { UpdateStatusFn, GenerateResponseOptions } from "../types";

// Re-export Anthropic tool helpers for consistent usage across all tool modules
export { anthropicCreateTool as tool };
export type { CoreMessage };

// Re-export types
export type { UpdateStatusFn, GenerateResponseOptions };

/**
 * Parameters passed to tool factory functions
 */
export interface AgentToolFactoryParams {
  messages: CoreMessage[];
  caseNumbers: string[];
  updateStatus?: UpdateStatusFn;
  options?: GenerateResponseOptions;
}

/**
 * Helper to create tools with proper typing
 * Uses Anthropic-native createTool() with type casting for flexibility
 */
export const createTool = anthropicCreateTool;

/**
 * Shared Azure Search service instance
 * Used by multiple tools for case and KB searches
 */
export const azureSearchService = createAzureSearchService();
