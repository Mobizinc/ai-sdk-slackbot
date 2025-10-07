import { describe, expect, it } from "vitest";
import { sanitizeModelConfig } from "../lib/model-capabilities";

describe("sanitizeModelConfig", () => {
  it("removes unsupported sampling knobs for GPT-5 models", () => {
    const config = sanitizeModelConfig("gpt-5-mini", {
      temperature: 0.7,
      topP: 0.95,
      frequencyPenalty: 0.3,
      presencePenalty: 0.1,
      other: "value",
    });

    expect(config).not.toHaveProperty("temperature");
    expect(config).not.toHaveProperty("topP");
    expect(config).not.toHaveProperty("frequencyPenalty");
    expect(config).not.toHaveProperty("presencePenalty");
    expect(config).toHaveProperty("other", "value");
  });

  it("leaves sampling knobs untouched for non GPT-5 models", () => {
    const config = sanitizeModelConfig("gpt-4o", {
      temperature: 0.7,
      topP: 0.95,
    });

    expect(config).toHaveProperty("temperature", 0.7);
    expect(config).toHaveProperty("topP", 0.95);
  });
});
