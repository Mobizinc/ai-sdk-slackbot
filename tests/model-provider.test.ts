import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadModule() {
  vi.resetModules();
  return import("../lib/model-provider");
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }

  vi.resetModules();
});

describe("selectLanguageModel", () => {
  it("uses Anthropic model when API key is available", async () => {
    // Keep ANTHROPIC_API_KEY from environment
    const { selectLanguageModel } = await loadModule();
    const selection = selectLanguageModel({ openAiModel: "gpt-test-mini" });

    expect(selection.modelId).toBe("claude-sonnet-4-5");
    expect(selection.provider).toBe("anthropic");
  });

  it("falls back to OpenAI when OpenAI model is specified and no Anthropic", async () => {
    // Temporarily remove Anthropic to test OpenAI fallback
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.OPENAI_FALLBACK_MODEL = "gpt-test-mini";

    const { selectLanguageModel } = await loadModule();
    const selection = selectLanguageModel({ openAiModel: "gpt-test-mini" });

    expect(selection.modelId).toBe("gpt-test-mini");
    expect(selection.provider).toBe("openai");
    
    // Restore original key
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });
});
