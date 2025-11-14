/**
 * Imports Altus server configuration items into ServiceNow CMDB (UAT).
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/import-altus-servers.ts [path] [--dry-run] [--limit=2] [--company-sys-id=<sys_id>]
 *
 * Defaults:
 *   - Input path: backup/altus-export-2025-10-15/dev/servers.json
 *   - Company sys_id: resolves "Altus Community Healthcare" automatically when not provided
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { serviceNowClient } from "../lib/tools/servicenow";

dotenv.config({ path: ".env.local" });
dotenv.config();

type ExportField = string | null | {
  value?: string;
  display_value?: string;
  displayValue?: string;
};

type ExportedServer = Record<string, ExportField>;

interface CliOptions {
  inputPath: string;
  dryRun: boolean;
  limit?: number;
  companySysId?: string;
}

const DEFAULT_INPUT = "backup/altus-export-2025-10-15/dev/servers.json";
const DEFAULT_COMPANY_NAME = "Altus Community Healthcare";

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!serviceNowClient.isConfigured()) {
    throw new Error("ServiceNow client is not configured. Check SERVICENOW_* environment variables.");
  }

  const inputPath = path.resolve(options.inputPath);
  const raw = await fs.readFile(inputPath, "utf-8");
  const data: ExportedServer[] = JSON.parse(raw);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No server records found in ${inputPath}`);
  }

  const companySysId = options.companySysId || await resolveCompanySysId(DEFAULT_COMPANY_NAME);
  if (!companySysId) {
    throw new Error(`Unable to resolve Altus company sys_id in ServiceNow for "${DEFAULT_COMPANY_NAME}".`);
  }

  console.log("==============================================");
  console.log(" Altus Server Import");
  console.log("==============================================");
  console.log(`Source file        : ${inputPath}`);
  console.log(`Mode               : ${options.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Company sys_id     : ${companySysId}`);
  if (options.limit) {
    console.log(`Record limit       : ${options.limit}`);
  }
  console.log("==============================================\n");

  const uniqueRecords = dedupeByName(data);
  const totalToProcess = options.limit ? Math.min(uniqueRecords.length, options.limit) : uniqueRecords.length;

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of uniqueRecords) {
    if (processed >= totalToProcess) break;
    processed += 1;

    const name = getField(record, "name");
    if (!name) {
      console.warn("Skipping record without name.");
      continue;
    }

    const className = getField(record, "sys_class_name") ?? "cmdb_ci_server";
    const shortDescription = getField(record, "short_description") ?? `Altus server imported from dev snapshot (${new Date().toISOString()})`;
    const ipAddress = getField(record, "ip_address") || getField(record, "u_ip_address");
    const environment = getField(record, "environment") || getField(record, "u_environment") || undefined;
    const status = getField(record, "operational_status") ?? "1"; // Operational
    const installStatus = getField(record, "install_status") ?? "1"; // Installed

    const attributes = buildAttributePayload(record);

    try {
      const existing = await serviceNowClient.searchConfigurationItems(
        {
          name,
          className,
          limit: 1,
        },
      );

      if (existing.length > 0) {
        console.log(`⏭️  ${name} already exists (${existing[0].sys_id}), skipping.`);
        skipped += 1;
        continue;
      }

      if (options.dryRun) {
        console.log(`📝 [DRY RUN] Would create ${name} (${className}) with IP ${ipAddress || "n/a"}`);
        created += 1;
        continue;
      }

      const createdCi = await serviceNowClient.createConfigurationItem({
        className,
        name,
        shortDescription,
        ipAddress,
        environment,
        status,
        installStatus,
        company: companySysId,
        attributes: Object.keys(attributes).length ? attributes : undefined,
      });

      console.log(`✅ Created ${createdCi.name ?? name} (${createdCi.sys_id})`);
      created += 1;
    } catch (error) {
      errors += 1;
      console.error(`❌ Failed to process ${name}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("\n==============================================");
  console.log(" Import Summary");
  console.log("==============================================");
  console.log(`Processed : ${processed}`);
  console.log(`Created   : ${created}`);
  console.log(`Skipped   : ${skipped}`);
  console.log(`Errors    : ${errors}`);
  console.log("==============================================");
}

function parseArgs(args: string[]): CliOptions {
  let inputPath = DEFAULT_INPUT;
  let dryRun = false;
  let limit: number | undefined;
  let companySysId: string | undefined;

  for (const arg of args) {
    if (arg === "--dry-run" || arg === "--dry") {
      dryRun = true;
    } else if (arg.startsWith("--limit=")) {
      const value = Number(arg.split("=")[1]);
      if (!Number.isNaN(value) && value > 0) {
        limit = value;
      }
    } else if (arg.startsWith("--company-sys-id=")) {
      const value = arg.split("=")[1]?.trim();
      if (value) {
        companySysId = value;
      }
    } else if (!arg.startsWith("--")) {
      inputPath = arg;
    }
  }

  return { inputPath, dryRun, limit, companySysId };
}

function getField(record: ExportedServer, key: string): string | undefined {
  const value = record[key];
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  if (typeof value === "object") {
    const raw = value.value ?? value.display_value ?? value.displayValue;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      return trimmed.length ? trimmed : undefined;
    }
  }

  return undefined;
}

function dedupeByName(records: ExportedServer[]): ExportedServer[] {
  const map = new Map<string, ExportedServer>();
  for (const record of records) {
    const name = getField(record, "name");
    if (name && !map.has(name)) {
      map.set(name, record);
    }
  }
  return Array.from(map.values());
}

function buildAttributePayload(record: ExportedServer): Record<string, string> {
  const attributes: Record<string, string> = {};
  const hostName = getField(record, "host_name");
  const fqdn = getField(record, "fqdn");
  const serialNumber = getField(record, "serial_number");
  const dnsDomain = getField(record, "dns_domain");
  const osVersion = getField(record, "os_version");
  const osServicePack = getField(record, "os_service_pack");
  const manufacturer = getField(record, "manufacturer");
  const modelId = getField(record, "model_id");

  if (hostName) attributes.host_name = hostName;
  if (fqdn) attributes.fqdn = fqdn;
  if (serialNumber) attributes.serial_number = serialNumber;
  if (dnsDomain) attributes.dns_domain = dnsDomain;
  if (osVersion) attributes.os_version = osVersion;
  if (osServicePack) attributes.os_service_pack = osServicePack;
  if (manufacturer) attributes.manufacturer = manufacturer;
  if (modelId) attributes.model_id = modelId;

  return attributes;
}

async function resolveCompanySysId(targetName: string): Promise<string | undefined> {
  const instanceUrl =
    process.env.SERVICENOW_INSTANCE_URL ||
    process.env.SERVICENOW_URL ||
    process.env.SN_INSTANCE_URL;

  const username = process.env.SERVICENOW_USERNAME || process.env.SN_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.SN_PASSWORD;
  const apiToken = process.env.SERVICENOW_API_TOKEN || process.env.SN_API_TOKEN;

  if (!instanceUrl) {
    console.warn("ServiceNow instance URL not set; cannot resolve company sys_id.");
    return undefined;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (username && password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  } else if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  } else {
    console.warn("No ServiceNow credentials available to resolve company sys_id.");
    return undefined;
  }

  const url = `${instanceUrl.replace(/\/$/, "")}/api/now/table/core_company?sysparm_query=${encodeURIComponent(
    `name=${targetName}`,
  )}&sysparm_limit=1`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.warn(`Failed to resolve company sys_id: HTTP ${response.status}`);
    return undefined;
  }

  const data = await response.json();
  const record = data.result?.[0];
  return record?.sys_id;
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
