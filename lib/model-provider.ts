import { config } from "./config";
import { getAnthropicClient, getConfiguredModel } from "./anthropic-provider";

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

export function getActiveModelId(): string {
  return anthropicModel;
}
