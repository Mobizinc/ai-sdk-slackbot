/**
 * AI SDK exports with LangSmith tracing
 *
 * Tracing is handled by:
 * - wrapSDK() for direct Anthropic client calls (lib/anthropic-provider.ts)
 * - wrapLanguageModel() for AI SDK models (lib/model-provider.ts)
 */

export { generateText, tool, stepCountIs, type CoreMessage } from "ai";
