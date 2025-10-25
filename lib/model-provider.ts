import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { wrapAISDKModel } from "langsmith/wrappers/vercel";
import { config } from "./config";
import { getAnthropicClient, getConfiguredModel } from "./anthropic-provider";

/**
 * LLM Provider Configuration
 *
 * Priority order:
 * 1. Anthropic API (ANTHROPIC_API_KEY) - Primary, supports prompt caching
 * 2. AI Gateway (AI_GATEWAY_API_KEY) - Legacy, deprecated
 * 3. OpenAI (OPENAI_API_KEY) - Fallback
 */

if (config.openaiApiKey && !process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = config.openaiApiKey;
}
if (config.aiGatewayApiKey && !process.env.AI_GATEWAY_API_KEY) {
  process.env.AI_GATEWAY_API_KEY = config.aiGatewayApiKey;
}
if (config.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
}
if (config.langsmithApiKey && !process.env.LANGSMITH_API_KEY) {
  process.env.LANGSMITH_API_KEY = config.langsmithApiKey;
}

// Determine primary provider
const useAnthropic = !!config.anthropicApiKey;
const useGateway = !useAnthropic && !!config.aiGatewayApiKey;
const useOpenAI = !useAnthropic && !useGateway && !!config.openaiApiKey;

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
const gatewayApiKey = config.aiGatewayApiKey?.trim?.() || "";
const gatewayDefaultModel =
  config.aiGatewayDefaultModel?.trim?.() ||
  config.aiGatewayModelOverride?.trim?.() ||
  "anthropic/claude-sonnet-4.5";

const gatewayProvider = gatewayApiKey && !useAnthropic
  ? createGateway({
      apiKey: gatewayApiKey,
    })
  : null;

// OpenAI fallback
const openAiClient = createOpenAI({
  apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
});

const openAiFallbackModel =
  config.openaiFallbackModel?.trim?.() ?? "gpt-4o-mini";

// Legacy AI SDK provider (for services that haven't migrated to Anthropic yet)
// When Anthropic is primary, we still provide a modelProvider for backwards compatibility
// using AI Gateway or OpenAI as fallback
const baseModel = gatewayProvider
  ? gatewayProvider(gatewayDefaultModel)
  : useOpenAI
  ? openAiClient(openAiFallbackModel)
  : useAnthropic && gatewayApiKey
  ? createGateway({ apiKey: gatewayApiKey })(gatewayDefaultModel)
  : useAnthropic && (config.openaiApiKey || process.env.OPENAI_API_KEY)
  ? openAiClient(openAiFallbackModel)
  : openAiClient(openAiFallbackModel);

// Wrap with LangSmith for automatic tracing
// Note: Direct Anthropic client calls are traced via wrapSDK() in anthropic-provider.ts
const shouldWrapWithLangSmith =
  config.langsmithTracingEnabled &&
  !!(config.langsmithApiKey || process.env.LANGSMITH_API_KEY);

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
