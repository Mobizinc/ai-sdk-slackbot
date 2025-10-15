import { createGateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { customProvider } from "ai";

// AI Gateway configuration - primary provider for Claude Sonnet 4.5
const gatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim();
const gatewayDefaultModel = process.env.AI_GATEWAY_DEFAULT_MODEL?.trim()
  ?? process.env.AI_GATEWAY_MODEL?.trim()
  ?? "anthropic/claude-sonnet-4.5";

const openAiFallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim() ?? "gpt-4o-mini";

// Create gateway provider once at module load (Vercel AI SDK best practice)
// AI SDK handles routing - only apiKey needed, no baseURL
const gatewayProvider = gatewayApiKey
  ? createGateway({
      apiKey: gatewayApiKey,
    })
  : null;

// Export unified provider with named models
// When AI_GATEWAY_API_KEY is set: uses GLM-4.6
// When not set: falls back to OpenAI models
const baseModel = gatewayProvider
  ? gatewayProvider(gatewayDefaultModel)
  : openai(openAiFallbackModel);

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

// Helper to get active model ID for logging
export function getActiveModelId(): string {
  return gatewayProvider ? gatewayDefaultModel : openAiFallbackModel;
}

/**
 * Backwards-compatible helper used in legacy tests and scripts.
 * Returns the effective model identifier that will be used for language tasks.
 */
export function selectLanguageModel(options: { openAiModel?: string } = {}) {
  const modelId = gatewayProvider
    ? gatewayDefaultModel
    : options.openAiModel?.trim() || openAiFallbackModel;

  return {
    modelId,
    provider: gatewayProvider ? "ai-gateway" : "openai",
  } as const;
}
