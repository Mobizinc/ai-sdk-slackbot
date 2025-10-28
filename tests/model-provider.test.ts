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

describe("Model Provider", () => {
  it("uses Anthropic model when API key is available", async () => {
    const { getActiveProvider, getActiveModelId } = await loadModule();
    const provider = getActiveProvider();
    const modelId = getActiveModelId();

    expect(provider.provider).toBe("anthropic");
    expect(modelId).toBe("claude-3-sonnet-20240229");
  });

  it("throws an error when no Anthropic API key is configured", async () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    await expect(loadModule()).rejects.toThrow(
      "No Anthropic API key configured. Set ANTHROPIC_API_KEY in the environment or config."
    );
    
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });
});