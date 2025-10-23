/**
 * Generate Response - Thin Facade
 *
 * This file provides a thin compatibility layer that routes requests
 * to either the refactored agent modules (lib/agent/) or the legacy
 * implementation based on the REFACTOR_ENABLED feature flag.
 *
 * Phase 3 Refactor: This facade is the entry point for all response
 * generation, allowing gradual migration from the monolithic legacy
 * implementation to the modular agent architecture.
 */

import type { CoreMessage } from "./instrumented-ai";
import { getFeatureFlags } from "./config/feature-flags";
import {
  generateResponseLegacy,
  __setGenerateTextImpl as __setLegacyGenerateTextImpl,
  __resetGenerateTextImpl as __resetLegacyGenerateTextImpl,
} from "./legacy-generate-response";

// Re-export types for backward compatibility
export type UpdateStatusFn = (status: string) => void;
export type GenerateResponseOptions = {
  channelId?: string;
  channelName?: string;
  threadTs?: string;
};

// Test injection points (re-exported from legacy)
export const __setGenerateTextImpl = __setLegacyGenerateTextImpl;
export const __resetGenerateTextImpl = __resetLegacyGenerateTextImpl;

// Export legacy implementation for direct use if needed
export { generateResponseLegacy };

// Cached refactored module
let refactoredAgentModule: typeof import("./agent") | null = null;

/**
 * Main entry point for response generation.
 * Routes to refactored agent modules or legacy implementation based on feature flag.
 */
export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: UpdateStatusFn,
  options?: GenerateResponseOptions,
): Promise<string> => {
  const flags = getFeatureFlags();

  if (flags.refactorEnabled) {
    // Lazy load refactored agent module
    if (!refactoredAgentModule) {
      refactoredAgentModule = await import("./agent");
    }

    // Use refactored implementation with legacy fallback
    return refactoredAgentModule.generateResponse(messages, updateStatus, options, {
      legacyExecutor: generateResponseLegacy,
    });
  }

  // Use legacy implementation
  return generateResponseLegacy(messages, updateStatus, options);
};
