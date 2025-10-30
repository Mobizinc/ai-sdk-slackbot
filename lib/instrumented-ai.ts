/**
 * AI SDK exports (temporary until intelligent-assistant.ts is migrated)
 *
 * NOTE: This file is a temporary shim to support lib/services/intelligent-assistant.ts
 * which still uses the AI SDK. Once intelligent-assistant.ts is migrated to direct
 * Anthropic SDK calls, this file should be deleted.
 *
 * TODO: Migrate intelligent-assistant.ts to Anthropic SDK and remove this file
 */

export { generateText, generateObject, tool, streamText, type CoreMessage } from "ai";
