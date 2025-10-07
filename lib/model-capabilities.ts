/**
 * Model capability helpers.
 * Provides utilities for ensuring we only send parameters supported by a model.
 */

const UNSUPPORTED_SAMPLING_KEYS = [
  "temperature",
  "topP",
  "top_p",
  "frequencyPenalty",
  "frequency_penalty",
  "presencePenalty",
  "presence_penalty",
] as const;

type MutableRecord = Record<string, unknown>;

/**
 * Remove sampling parameters that GPT-5 models currently reject.
 * GPT-5 models operate with deterministic sampling and will error if any of
 * the sampling knobs (temperature, top_p, penalties) are set.
 */
export function sanitizeModelConfig<T extends MutableRecord>(
  modelName: string,
  config: T,
): T {
  const lowered = (modelName ?? "").toLowerCase();

  if (!lowered.startsWith("gpt-5")) {
    return config;
  }

  let removedAny = false;
  for (const key of UNSUPPORTED_SAMPLING_KEYS) {
    if (key in config) {
      delete (config as MutableRecord)[key];
      removedAny = true;
    }
  }

  if (removedAny) {
    console.warn(
      `[ModelSanitizer] Removed unsupported sampling parameters for ${modelName}.`,
    );
  }

  return config;
}
