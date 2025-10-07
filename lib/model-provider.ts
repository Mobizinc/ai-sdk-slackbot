import { createGateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";
export interface ModelSelection {
  model: LanguageModelV1;
  modelId: string;
}

const gatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim();
const gatewayBaseUrl = process.env.AI_GATEWAY_URL?.trim();
const gatewayDefaultModel = process.env.AI_GATEWAY_DEFAULT_MODEL?.trim()
  ?? process.env.AI_GATEWAY_MODEL?.trim()
  ?? "zai/glm-4.5";

const openAiFallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim() ?? "gpt-5-mini";

let gatewayProvider: ReturnType<typeof createGateway> | null = null;

if (gatewayApiKey) {
  gatewayProvider = createGateway({
    apiKey: gatewayApiKey,
    baseURL: gatewayBaseUrl,
  });
}

interface SelectModelOptions {
  openAiModel?: string;
  gatewayModel?: string;
}

export function selectLanguageModel(options: SelectModelOptions = {}): ModelSelection {
  const { openAiModel = openAiFallbackModel, gatewayModel } = options;

  if (gatewayProvider) {
    const targetModel = gatewayModel?.trim() || gatewayDefaultModel;
    return {
      model: gatewayProvider(targetModel) as unknown as LanguageModelV1,
      modelId: targetModel,
    };
  }

  return {
    model: openai(openAiModel),
    modelId: openAiModel,
  };
}
