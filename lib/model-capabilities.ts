/**
 * Model capability helpers.
 * Provides utilities for ensuring we only send parameters supported by a model.
 */

const UNSUPPORTED_SAMPLING_KEYS = [
  "topP",
  "top_p",
  "frequencyPenalty",
  "frequency_penalty",
  "presencePenalty",
  "presence_penalty",
] as const;

type MutableRecord = Record<string, unknown>;

/**
 * Normalise sampling parameters for GPT-5 models.
 *
 * GPT-5 endpoints reject requests that include sampling knobs and currently
 * require the default temperature of 1. We coerce the configuration accordingly
 * and strip the unsupported fields to avoid API errors.
 */
export function sanitizeModelConfig<T extends MutableRecord>(
  modelName: string,
  config: T,
): T {
  const lowered = (modelName ?? "").toLowerCase();

  if (!lowered.startsWith("gpt-5")) {
    return config;
  }

  const record = config as MutableRecord;
  let mutated = false;

  for (const key of UNSUPPORTED_SAMPLING_KEYS) {
    if (key in record) {
      delete record[key];
      mutated = true;
    }
  }

  const existingTemp = record.temperature;
  if (existingTemp !== undefined && existingTemp !== 1) {
    mutated = true;
  }

  record.temperature = 1;

  if (mutated) {
    console.warn(
      `[ModelSanitizer] Normalised unsupported sampling parameters for ${modelName}.`,
    );
  }

  return config;
}
