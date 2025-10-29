import { createGateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { wrapAISDKModel } from 'langsmith/wrappers/vercel';
import { getAnthropicClient, getConfiguredModel } from './anthropic-provider';

if (!config.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "No Anthropic API key configured. Set ANTHROPIC_API_KEY in the environment or config.",
  );
}

export const anthropic = getAnthropicClient();
export const anthropicModel = getConfiguredModel();

export function getActiveProvider(): { provider: "anthropic"; model: string } {
  return { provider: "anthropic", model: anthropicModel };
}

// Export for direct Anthropic usage (preferred for new code)
export const anthropic = useAnthropic ? getAnthropicClient() : null;
export const anthropicModel = useAnthropic ? getConfiguredModel() : null;

// AI Gateway configuration (legacy)
const gatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim();
const gatewayDefaultModel = process.env.AI_GATEWAY_DEFAULT_MODEL?.trim()
  ?? process.env.AI_GATEWAY_MODEL?.trim()
  ?? "anthropic/claude-sonnet-4.5";

const gatewayProvider = gatewayApiKey && !useAnthropic
  ? createGateway({
      apiKey: gatewayApiKey,
    })
  : null;

// OpenAI fallback
const openAiFallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim() ?? "gpt-4o-mini";

// Legacy AI SDK provider (for services that haven't migrated to Anthropic yet)
// When Anthropic is primary, we still provide a modelProvider for backwards compatibility
// using AI Gateway or OpenAI as fallback
const baseModel = gatewayProvider
  ? gatewayProvider(gatewayDefaultModel)
  : useOpenAI
  ? openai(openAiFallbackModel)
  : useAnthropic && gatewayApiKey
  ? createGateway({ apiKey: gatewayApiKey })(gatewayDefaultModel)
  : useAnthropic && process.env.OPENAI_API_KEY
  ? openai(openAiFallbackModel)
  : openai(openAiFallbackModel); // Final fallback - will use OPENAI_API_KEY env var

// Wrap with LangSmith for automatic tracing
// Note: Direct Anthropic client calls are traced via wrapSDK() in anthropic-provider.ts
const shouldWrapWithLangSmith =
  (process.env.LANGSMITH_TRACING ?? '').toLowerCase() === 'true' &&
  !!process.env.LANGSMITH_API_KEY?.trim();

const tracedModel = shouldWrapWithLangSmith
  ? wrapAISDKModel(baseModel)
  : baseModel;

if (shouldWrapWithLangSmith && !useAnthropic) {
  console.log('[LangSmith] Wrapped AI SDK models for tracing');
}

export const modelProvider = customProvider({
  languageModels: {
    "chat-model": tracedModel,
    "kb-generator": tracedModel,
    "quality-analyzer": tracedModel,
    "resolution-summary": tracedModel,
    "intelligent-assistant": tracedModel,
    "kb-assistant": tracedModel,
  },
});

/**
 * Get active provider information
 */
export function getActiveProvider(): {
  provider: 'anthropic' | 'ai-gateway' | 'openai';
  model: string;
} {
  if (useAnthropic) {
    return { provider: 'anthropic', model: anthropicModel! };
  }
  if (useGateway) {
    return { provider: 'ai-gateway', model: gatewayDefaultModel };
  }
  return { provider: 'openai', model: openAiFallbackModel };
}

/**
 * Helper to get active model ID for logging
 */
export function getActiveModelId(): string {
  return anthropicModel;
}
