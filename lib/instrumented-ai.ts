/**
 * @deprecated Legacy AI SDK compatibility layer
 *
 * This module exists only for backward compatibility with legacy-generate-response.ts
 * and will be removed once the legacy path is fully deprecated.
 *
 * **Migration Guide:**
 * - Use `ChatMessage` from `services/anthropic-chat` instead of `CoreMessage`
 * - Use `createTool` from `agent/tools/anthropic-tools` instead of `tool`
 * - Use `AnthropicChatService` instead of `generateText`
 *
 * **DO NOT import from this module in new code!**
 */

// Re-export Anthropic-native types directly from their sources
export type { ChatMessage, ChatMessage as CoreMessage } from "./services/anthropic-chat";
export { createTool as tool } from "./agent/tools/anthropic-tools";

// Keep AI SDK exports ONLY for legacy-generate-response.ts
// These will be removed when legacy path is deprecated
export { generateText, stepCountIs } from "ai";
