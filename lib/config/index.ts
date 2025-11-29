// Barrel export for config module
export {
  getConfigValue,
  getConfig,
  getConfigSync,
  refreshConfig,
  serializeConfigValue
} from "./loader.js";
export type { ConfigKey, ConfigValueMap } from "./registry.js";
export * from "./escalation-channels.js";
export * from "./helpers.js";
