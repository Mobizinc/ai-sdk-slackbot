import { CONFIG_DEFINITIONS, type ConfigDefinition, type ConfigKey, type ConfigValueMap } from "./registry";
import { getAppSetting } from "../services/app-settings";
import { getDb } from "../db/client";

type RawOverrides = Map<ConfigKey, string>;

const CONFIG_KEYS = Object.keys(CONFIG_DEFINITIONS) as ConfigKey[];

const config: ConfigValueMap = createInitialConfig();
let initialized = false;
let loadPromise: Promise<ConfigValueMap> | null = null;

void ensureConfigLoaded();

export function getConfigSync(): ConfigValueMap {
  return config;
}

export async function getConfig(): Promise<ConfigValueMap> {
  await ensureConfigLoaded();
  return config;
}

export async function refreshConfig(): Promise<ConfigValueMap> {
  loadPromise = loadAndApplyConfig();
  await loadPromise;
  return config;
}

export function getConfigValue<K extends ConfigKey>(key: K): ConfigValueMap[K] {
  return config[key];
}

function createInitialConfig(): ConfigValueMap {
  const initial: Partial<ConfigValueMap> = {};
  for (const key of CONFIG_KEYS) {
    const definition = CONFIG_DEFINITIONS[key];
    const envRaw = definition.envVar ? process.env[definition.envVar] : undefined;
    initial[key] = parseValue(definition, envRaw);
  }
  return initial as ConfigValueMap;
}

async function ensureConfigLoaded(): Promise<ConfigValueMap> {
  if (initialized) {
    return config;
  }

  if (!loadPromise) {
    loadPromise = loadAndApplyConfig();
  }

  await loadPromise;
  return config;
}

async function loadAndApplyConfig(): Promise<ConfigValueMap> {
  try {
    const overrides = await loadOverridesFromDatabase();
    applyOverrides(config, overrides);
    initialized = true;
  } catch (error) {
    console.error("[Config] Failed to load overrides from database:", error);
  } finally {
    loadPromise = null;
  }
  return config;
}

async function loadOverridesFromDatabase(): Promise<RawOverrides> {
  const overrides: RawOverrides = new Map();

  if (!getDb()) {
    return overrides;
  }

  for (const key of CONFIG_KEYS) {
    try {
      const value = await getAppSetting(key);
      if (value !== null && value !== undefined && value !== "") {
        overrides.set(key, value);
      }
    } catch (error) {
      console.warn(`[Config] Unable to fetch app setting for key "${key}":`, error);
    }
  }

  return overrides;
}

function applyOverrides(target: ConfigValueMap, overrides: RawOverrides): void {
  const mutableTarget = target as unknown as Record<ConfigKey, unknown>;
  for (const key of CONFIG_KEYS) {
    const definition = CONFIG_DEFINITIONS[key];
    const raw = overrides.get(key) ?? (definition.envVar ? process.env[definition.envVar] : undefined);
    mutableTarget[key] = parseValue(definition, raw);
  }
}

function parseValue(definition: ConfigDefinition, raw: string | undefined): any {
  if (raw === undefined || raw === null || raw === "") {
    return cloneDefault(definition);
  }

  switch (definition.type) {
    case "boolean": {
      const normalised = raw.trim().toLowerCase();
      if (normalised === "true" || normalised === "1" || normalised === "yes") {
        return true;
      }
      if (normalised === "false" || normalised === "0" || normalised === "no") {
        return false;
      }
      console.warn(`[Config] Invalid boolean for ${definition.envVar ?? "config key"}: ${raw}. Falling back to default.`);
      return cloneDefault(definition);
    }
    case "number": {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      console.warn(`[Config] Invalid number for ${definition.envVar ?? "config key"}: ${raw}. Falling back to default.`);
      return cloneDefault(definition);
    }
    case "string[]": {
      const trimmed = raw.trim();
      if (trimmed === "") {
        return cloneDefault(definition);
      }

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
            return [...parsed];
          }
        } catch (error) {
          console.warn(
            `[Config] Failed to parse JSON array for ${definition.envVar ?? "config key"}: ${error}. Falling back to comma parsing.`,
          );
        }
      }

      const items = trimmed
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (items.length > 0) {
        return items;
      }

      return cloneDefault(definition);
    }
    case "string":
    default:
      return raw;
  }
}

function cloneDefault(definition: ConfigDefinition): any {
  if (definition.type === "string[]") {
    return Array.isArray(definition.default) ? [...(definition.default as string[])] : [];
  }
  return definition.default;
}

export function serializeConfigValue(key: ConfigKey, value: unknown): string {
  const definition = CONFIG_DEFINITIONS[key];

  switch (definition.type) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? String(value) : String(definition.default);
    case "string[]":
      if (Array.isArray(value)) {
        return JSON.stringify(value);
      }
      return JSON.stringify(cloneDefault(definition));
    case "string":
    default:
      return typeof value === "string" ? value : String(value ?? definition.default ?? "");
  }
}
