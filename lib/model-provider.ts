import { createGateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { customProvider } from "ai";

// AI Gateway configuration - primary provider for GLM-4.6
const gatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim();
const gatewayBaseUrl = process.env.AI_GATEWAY_URL?.trim();
const gatewayDefaultModel = process.env.AI_GATEWAY_DEFAULT_MODEL?.trim()
  ?? process.env.AI_GATEWAY_MODEL?.trim()
  ?? "zai/glm-4.6";

const openAiFallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim() ?? "gpt-5-mini";

// Create gateway provider once at module load (Vercel AI SDK best practice)
const gatewayProvider = gatewayApiKey
  ? createGateway({
      apiKey: gatewayApiKey,
      baseURL: gatewayBaseUrl,
    })
  : null;

// Export unified provider with named models
// When AI_GATEWAY_API_KEY is set: uses GLM-4.6
// When not set: falls back to OpenAI models
export const modelProvider = customProvider({
  languageModels: {
    "chat-model": gatewayProvider
      ? gatewayProvider(gatewayDefaultModel)
      : openai(openAiFallbackModel),
    "kb-generator": gatewayProvider
      ? gatewayProvider(gatewayDefaultModel)
      : openai(openAiFallbackModel),
    "quality-analyzer": gatewayProvider
      ? gatewayProvider(gatewayDefaultModel)
      : openai(openAiFallbackModel),
    "resolution-summary": gatewayProvider
      ? gatewayProvider(gatewayDefaultModel)
      : openai(openAiFallbackModel),
    "intelligent-assistant": gatewayProvider
      ? gatewayProvider(gatewayDefaultModel)
      : openai(openAiFallbackModel),
    "kb-assistant": gatewayProvider
      ? gatewayProvider(gatewayDefaultModel)
      : openai(openAiFallbackModel),
  },
});

// Helper to get active model ID for logging
export function getActiveModelId(): string {
  return gatewayProvider ? gatewayDefaultModel : openAiFallbackModel;
}
