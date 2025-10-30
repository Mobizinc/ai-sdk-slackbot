import { config } from "./config";
import { getAnthropicClient, getConfiguredModel } from "./anthropic-provider";
import { createAnthropic } from "@ai-sdk/anthropic";

if (!config.anthropicApiKey && !config.anthropicApiKey) {
  throw new Error(
    "No Anthropic API key configured. Set ANTHROPIC_API_KEY in the environment or config.",
  );
}

export const anthropic = getAnthropicClient();
export const anthropicModel = getConfiguredModel();

export function getActiveProvider(): { provider: "anthropic"; model: string } {
  return { provider: "anthropic", model: anthropicModel };
}

export function getActiveModelId(): string {
  return anthropicModel;
}

/**
 * Temporary shim for intelligent-assistant.ts compatibility
 * TODO: Remove once intelligent-assistant.ts is migrated to direct Anthropic SDK
 */
const aiSDKProvider = createAnthropic({
  apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
});

export const modelProvider = {
  languageModel: (_purpose?: string) => {
    return aiSDKProvider(anthropicModel);
  },
};
