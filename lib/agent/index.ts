/**
 * Agent Module Entry Point (Phase 3 Complete)
 *
 * This module exposes the refactored generateResponse implementation using
 * the modular agent architecture (orchestrator → context-loader → prompt-builder →
 * runner → message-formatter). Provides graceful fallback to legacy executor on errors.
 */

import type { ChatMessage } from "../services/anthropic-chat";
import type { GenerateResponseOptions, UpdateStatusFn, LegacyExecutorDeps } from "./types";
import { getOrchestrator } from "./orchestrator";

export async function generateResponse(
  messages: ChatMessage[],
  updateStatus?: UpdateStatusFn,
  options?: GenerateResponseOptions,
  deps?: LegacyExecutorDeps,
): Promise<string> {
  const orchestrator = getOrchestrator();
  return orchestrator.run(messages, updateStatus, options, deps);
}
