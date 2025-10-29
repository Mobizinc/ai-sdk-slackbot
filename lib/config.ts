import { CONFIG_DEFINITIONS, type ConfigDefinition, type ConfigKey, type ConfigValueMap } from "./config/registry";
import {
  getConfig,
  getConfigSync,
  refreshConfig,
  getConfigValue,
  serializeConfigValue,
} from "./config/loader";

export { CONFIG_DEFINITIONS };
export type { ConfigDefinition, ConfigKey, ConfigValueMap };

export const config = getConfigSync();
