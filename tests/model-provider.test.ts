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
  it("falls back to OpenAI when gateway is not configured", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.OPENAI_FALLBACK_MODEL = "gpt-test-mini";

    const { selectLanguageModel } = await loadModule();
    const selection = selectLanguageModel({ openAiModel: "gpt-test-mini" });

    expect(selection.modelId).toBe("gpt-test-mini");
  });

  it("uses AI Gateway model when configured", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    process.env.AI_GATEWAY_DEFAULT_MODEL = "zai/glm-4.6";

    const { selectLanguageModel } = await loadModule();
    const selection = selectLanguageModel({ openAiModel: "gpt-test-mini" });

    expect(selection.modelId).toBe("zai/glm-4.6");
  });
});
