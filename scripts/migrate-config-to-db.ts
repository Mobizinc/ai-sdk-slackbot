import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import { CONFIG_DEFINITIONS, type ConfigKey } from "../lib/config/registry";
import { getAppSetting, setAppSetting } from "../lib/services/app-settings";
import { getConfig, getConfigValue, serializeConfigValue } from "../lib/config";

async function migrate(): Promise<void> {
  const force = process.argv.includes("--force");
  const keys = Object.keys(CONFIG_DEFINITIONS) as ConfigKey[];

  await getConfig();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  let skippedSensitive = 0;

  for (const key of keys) {
    const definition = CONFIG_DEFINITIONS[key];
    if (definition.sensitive) {
      skippedSensitive += 1;
      continue;
    }

    const existing = await getAppSetting(key);
    const currentValue = getConfigValue(key);
    const serialized = serializeConfigValue(key, currentValue);

    if (existing !== null && existing !== undefined && existing !== "") {
      if (!force) {
        skipped += 1;
        continue;
      }

      if (existing === serialized) {
        skipped += 1;
        continue;
      }

      await setAppSetting(key, serialized);
      updated += 1;
      continue;
    }

    await setAppSetting(key, serialized);
    created += 1;
  }

  console.log("Configuration migration complete:");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Skipped (sensitive): ${skippedSensitive}`);
  console.log(`  Total keys processed: ${keys.length}`);

  if (!force) {
    console.log("Run with --force to overwrite existing values.");
  }
}

migrate().catch((error) => {
  console.error("Configuration migration failed:", error);
  process.exit(1);
});
