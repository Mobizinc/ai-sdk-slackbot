/**
 * Anthropic API Provider
 * Direct Anthropic SDK client with prompt caching support
 */

import Anthropic from "@anthropic-ai/sdk";
import { wrapSDK } from "langsmith/wrappers";
import { config } from "./config";

// Singleton client instance
let anthropicClient: Anthropic | null = null;
let anthropicClientWrapped = false;

/**
 * Get or create Anthropic client instance
 */
export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";

    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY not configured. ' +
        'Get your API key from https://console.anthropic.com/'
      );
    }

    const baseClient = new Anthropic({
      apiKey,
      maxRetries: 2,
      timeout: 120000, // 120 seconds
    });

    anthropicClient = shouldWrapWithLangSmith()
      ? wrapAnthropicWithLangSmith(baseClient)
      : baseClient;

    console.log('[Anthropic] Initialized client');
  } else if (!anthropicClientWrapped && shouldWrapWithLangSmith()) {
    anthropicClient = wrapAnthropicWithLangSmith(anthropicClient);
  }

  return anthropicClient;
}

function shouldWrapWithLangSmith(): boolean {
  const tracingEnabled =
    config.langsmithTracingEnabled ||
    (process.env.LANGSMITH_TRACING ?? "").toLowerCase() === "true";
  const hasApiKey = !!(config.langsmithApiKey || process.env.LANGSMITH_API_KEY?.trim());
  return tracingEnabled && hasApiKey;
}

function wrapAnthropicWithLangSmith(client: Anthropic): Anthropic {
  try {
    const wrapped = wrapSDK(client);
    anthropicClientWrapped = true;
    console.log('[LangSmith] Enabled tracing for Anthropic client');
    return wrapped;
  } catch (error) {
    console.warn('[LangSmith] Failed to wrap Anthropic client:', error);
    return client;
  }
}

/**
 * Supported Anthropic models
 */
export const ANTHROPIC_MODELS = {
  // Primary models
  SONNET_45: 'claude-sonnet-4-5',
  SONNET_4: 'claude-sonnet-4',
  OPUS_4: 'claude-opus-4',
  HAIKU_45: 'claude-haiku-4-5',

  // Legacy (for fallback)
  SONNET_37: 'claude-sonnet-3-7',
  HAIKU_35: 'claude-haiku-3-5',
} as const;

export type AnthropicModel = typeof ANTHROPIC_MODELS[keyof typeof ANTHROPIC_MODELS];

/**
 * Get configured Anthropic model
 */
export function getConfiguredModel(): AnthropicModel {
  const configured = config.anthropicModel?.trim?.() || process.env.ANTHROPIC_MODEL?.trim();

  // Validate against supported models
  const supportedModels = Object.values(ANTHROPIC_MODELS);
  if (configured && supportedModels.includes(configured as AnthropicModel)) {
    return configured as AnthropicModel;
  }

  // Default to Sonnet 4.5
  return ANTHROPIC_MODELS.SONNET_45;
}

/**
 * Pricing per million tokens (as of 2025-01)
 * Source: https://www.anthropic.com/pricing
 */
export const MODEL_PRICING = {
  [ANTHROPIC_MODELS.SONNET_45]: {
    input: 3.00,
    output: 15.00,
    cache_write_5m: 3.75,  // 25% premium
    cache_write_1h: 6.00,   // 100% premium
    cache_read: 0.30,       // 90% savings
  },
  [ANTHROPIC_MODELS.SONNET_4]: {
    input: 3.00,
    output: 15.00,
    cache_write_5m: 3.75,
    cache_write_1h: 6.00,
    cache_read: 0.30,
  },
  [ANTHROPIC_MODELS.OPUS_4]: {
    input: 15.00,
    output: 75.00,
    cache_write_5m: 18.75,
    cache_write_1h: 30.00,
    cache_read: 1.50,
  },
  [ANTHROPIC_MODELS.HAIKU_45]: {
    input: 1.00,
    output: 5.00,
    cache_write_5m: 1.25,
    cache_write_1h: 2.00,
    cache_read: 0.10,
  },
  [ANTHROPIC_MODELS.SONNET_37]: {
    input: 3.00,
    output: 15.00,
    cache_write_5m: 3.75,
    cache_write_1h: 6.00,
    cache_read: 0.30,
  },
  [ANTHROPIC_MODELS.HAIKU_35]: {
    input: 0.80,
    output: 4.00,
    cache_write_5m: 1.00,
    cache_write_1h: 1.60,
    cache_read: 0.08,
  },
} as const;

/**
 * Calculate cost based on Anthropic usage metrics
 */
export function calculateCost(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  model: AnthropicModel = getConfiguredModel()
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    console.warn(`[Anthropic] No pricing information for model: ${model}`);
    return 0;
  }

  const inputCost = ((usage.input_tokens || 0) / 1_000_000) * pricing.input;
  const outputCost = ((usage.output_tokens || 0) / 1_000_000) * pricing.output;
  const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cache_write_5m;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cache_read;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

/**
 * Calculate cache hit rate as percentage
 */
export function calculateCacheHitRate(usage: {
  input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): number {
  const totalInputTokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);

  if (totalInputTokens === 0) {
    return 0;
  }

  return ((usage.cache_read_input_tokens || 0) / totalInputTokens) * 100;
}

/**
 * Format usage metrics for logging
 */
export function formatUsageMetrics(usage: Anthropic.Usage): string {
  const metrics = [
    `Input: ${usage.input_tokens}`,
    `Output: ${usage.output_tokens}`,
  ];

  if (usage.cache_creation_input_tokens) {
    metrics.push(`Cache write: ${usage.cache_creation_input_tokens}`);
  }

  if (usage.cache_read_input_tokens) {
    metrics.push(`Cache read: ${usage.cache_read_input_tokens}`);
    const hitRate = calculateCacheHitRate(usage);
    metrics.push(`Hit rate: ${hitRate.toFixed(1)}%`);
  }

  return metrics.join(' | ');
}
