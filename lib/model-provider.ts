import { createGateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { customProvider, type LanguageModel } from "ai";

// AI Gateway configuration - primary provider for GLM-4.6
const gatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim();
const gatewayDefaultModel = process.env.AI_GATEWAY_DEFAULT_MODEL?.trim()
  ?? process.env.AI_GATEWAY_MODEL?.trim()
  ?? "zai/glm-4.6";

const openAiFallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim() ?? "gpt-5-mini";

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
const baseModel = (gatewayProvider
  ? gatewayProvider(gatewayDefaultModel)
  : openai(openAiFallbackModel)) as LanguageModel;

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
