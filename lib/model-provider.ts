import { createGateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { getAnthropicClient, getConfiguredModel } from './anthropic-provider';

/**
 * LLM Provider Configuration
 *
 * Priority order:
 * 1. Anthropic API (ANTHROPIC_API_KEY) - Primary, supports prompt caching
 * 2. AI Gateway (AI_GATEWAY_API_KEY) - Legacy, deprecated
 * 3. OpenAI (OPENAI_API_KEY) - Fallback
 */

// Determine primary provider
const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const useGateway = !useAnthropic && !!process.env.AI_GATEWAY_API_KEY;
const useOpenAI = !useAnthropic && !useGateway && !!process.env.OPENAI_API_KEY;

if (!useAnthropic && !useGateway && !useOpenAI) {
  throw new Error(
    'No LLM provider configured. ' +
    'Set ANTHROPIC_API_KEY (recommended), AI_GATEWAY_API_KEY, or OPENAI_API_KEY'
  );
}

// Log provider selection
if (useAnthropic) {
  console.log('[Model Provider] Using Anthropic API (direct) with prompt caching support');
} else if (useGateway) {
  console.log('[Model Provider] Using AI Gateway (legacy) - consider migrating to Anthropic API');
} else {
  console.log('[Model Provider] Using OpenAI API (fallback)');
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

export const modelProvider = customProvider({
  languageModels: {
    "chat-model": baseModel,
    "kb-generator": baseModel,
    "quality-analyzer": baseModel,
    "resolution-summary": baseModel,
    "intelligent-assistant": baseModel,
    "kb-assistant": baseModel,
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
  return getActiveProvider().model;
}

/**
 * Backwards-compatible helper used in legacy tests and scripts.
 * Returns the effective model identifier that will be used for language tasks.
 */
export function selectLanguageModel(options: { openAiModel?: string } = {}) {
  const activeProvider = getActiveProvider();

  if (activeProvider.provider === 'openai' && options.openAiModel) {
    return {
      modelId: options.openAiModel.trim(),
      provider: 'openai',
    } as const;
  }

  return {
    modelId: activeProvider.model,
    provider: activeProvider.provider,
  } as const;
}
