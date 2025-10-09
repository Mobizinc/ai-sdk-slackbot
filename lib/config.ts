interface NumericOption {
  value: number;
  defaultValue: number;
  raw: string | undefined;
  envKey: string;
}

function parseNumberOption({ value, defaultValue, raw, envKey }: NumericOption): number {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  if (raw !== undefined) {
    console.warn(
      `[Config] Ignoring invalid value for ${envKey}: ${raw}. Using default ${defaultValue}.`,
    );
  }

  return defaultValue;
}

function getNumberEnv(envKey: string, defaultValue: number): number {
  const raw = process.env[envKey];
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);
  return parseNumberOption({ value: parsed, defaultValue, raw, envKey });
}

export const config = {
  kbGatheringTimeoutHours: getNumberEnv("KB_GATHERING_TIMEOUT_HOURS", 24),
  kbGatheringMaxAttempts: getNumberEnv("KB_GATHERING_MAX_ATTEMPTS", 5),
  assistantMinDescriptionLength: getNumberEnv("ASSISTANT_MIN_DESCRIPTION_LENGTH", 10),
  assistantSimilarCasesTopK: getNumberEnv("ASSISTANT_SIMILAR_CASES_TOP_K", 3),
  kbSimilarCasesTopK: getNumberEnv("KB_SIMILAR_CASES_TOP_K", 3),
};
