import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import { CONFIG_DEFINITIONS, type ConfigKey } from "../lib/config/registry";
import { getConfig, getConfigValue, serializeConfigValue } from "../lib/config";
import { getAppSetting, setAppSetting } from "../lib/services/app-settings";

interface CLIOptions {
  force: boolean;
  dryRun: boolean;
  includeSensitive: boolean;
  includeDefaults: boolean;
}

function parseArgs(): CLIOptions {
  const args = new Set(process.argv.slice(2));
  return {
    force: args.has("--force"),
    dryRun: args.has("--dry-run"),
    includeSensitive: args.has("--include-sensitive"),
    includeDefaults: args.has("--include-defaults"),
  };
}

async function migrate(): Promise<void> {
  const options = parseArgs();
  const keys = Object.keys(CONFIG_DEFINITIONS) as ConfigKey[];

  await getConfig();

  const summary = {
    created: 0,
    updated: 0,
    skippedExisting: 0,
    skippedDefaults: 0,
    skippedSensitive: 0,
    errors: 0,
  };

  const actions: Array<{
    key: ConfigKey;
    action: "created" | "updated" | "skipped" | "error";
    reason?: string;
  }> = [];

  for (const key of keys) {
    const definition = CONFIG_DEFINITIONS[key];

    if (definition.sensitive && !options.includeSensitive) {
      summary.skippedSensitive += 1;
      actions.push({ key, action: "skipped", reason: "sensitive" });
      continue;
    }

    const envValue = definition.envVar ? process.env[definition.envVar] : undefined;
    const existing = await getAppSetting(key);
    const effectiveValue = getConfigValue(key);
    const serializedValue = serializeConfigValue(key, effectiveValue);

    const shouldPersistDefault = options.includeDefaults || Boolean(envValue) || Boolean(existing);

    if (!shouldPersistDefault) {
      summary.skippedDefaults += 1;
      actions.push({ key, action: "skipped", reason: "no explicit value" });
      continue;
    }

    if (!options.force && existing !== null && existing !== undefined && existing !== "") {
      if (existing === serializedValue) {
        summary.skippedExisting += 1;
        actions.push({ key, action: "skipped", reason: "up-to-date" });
        continue;
      }
    }

    if (options.dryRun) {
      actions.push({ key, action: existing ? "updated" : "created" });
      if (existing) {
        summary.updated += 1;
      } else {
        summary.created += 1;
      }
      continue;
    }

    try {
      await setAppSetting(key, serializedValue);
      if (existing) {
        summary.updated += 1;
        actions.push({ key, action: "updated" });
      } else {
        summary.created += 1;
        actions.push({ key, action: "created" });
      }
    } catch (error) {
      summary.errors += 1;
      actions.push({ key, action: "error", reason: String(error) });
      console.error(`[migrate-config] Failed to persist ${key}:`, error);
    }
  }

  console.log("Configuration migration summary:");
  console.log(`  Created:            ${summary.created}`);
  console.log(`  Updated:            ${summary.updated}`);
  console.log(`  Skipped (existing): ${summary.skippedExisting}`);
  console.log(`  Skipped (defaults): ${summary.skippedDefaults}`);
  console.log(`  Skipped (sensitive):${summary.skippedSensitive}`);
  console.log(`  Errors:             ${summary.errors}`);
  console.log(`  Total processed:    ${keys.length}`);

  if (options.dryRun) {
    console.log("Dry run only. Re-run without --dry-run to apply changes.");
  }

  if (!options.force) {
    console.log("Use --force to overwrite existing values.");
  }

  if (!options.includeSensitive) {
    console.log("Sensitive keys skipped. Use --include-sensitive to migrate them.");
  }

  if (!options.includeDefaults) {
    console.log("Defaults omitted. Use --include-defaults to persist default values.");
  }

  const details = actions.filter((entry) => entry.action !== "skipped");
  if (details.length > 0) {
    console.log("\nActions:");
    for (const entry of details) {
      console.log(`  - ${entry.key}: ${entry.action}${entry.reason ? ` (${entry.reason})` : ""}`);
    }
  }
}

migrate().catch((error) => {
  console.error("Configuration migration failed:", error);
  process.exit(1);
});
