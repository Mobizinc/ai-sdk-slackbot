import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  getVeloCloudService,
  resolveVeloCloudConfig,
  listAvailableVeloCloudCustomers,
} from "../lib/services/velocloud-service";

loadEnv();
loadEnv({ path: ".env.local", override: true });

async function main() {
  const arg = process.argv[2];
  const outputArg = process.argv.find((value) => value.startsWith("--out="));
  const outputPath = outputArg ? outputArg.split("=")[1] : "ci-records/velocloud-edges.json";

  const customers =
    arg && arg !== "all"
      ? [arg]
      : listAvailableVeloCloudCustomers().filter((name) => name !== "default").concat("default");

  const uniqueCustomers = Array.from(new Set(customers));

  if (uniqueCustomers.length === 0) {
    throw new Error(
      "No VeloCloud credentials found. Set VELOCLOUD_URL/VELOCLOUD_API_TOKEN or customer-specific env vars."
    );
  }

  const service = getVeloCloudService();
  const payload: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    source: "velocloud",
    customers: [],
  };

  for (const customer of uniqueCustomers) {
    const resolved = resolveVeloCloudConfig(customer === "default" ? undefined : customer);
    if (!resolved) {
      console.warn(`⚠️  Skipping ${customer} because credentials were not found.`);
      continue;
    }

    const { config, resolvedCustomer } = resolved;
    const edges = await service.listEdges(config, config.enterpriseId);

    const records = edges.map((edge) => ({
      edge_id: edge.id ?? null,
      edge_name: edge.name ?? null,
      logical_id: (edge as any).logicalId ?? (edge as any).logical_id ?? null,
      enterprise_id: (edge as any).enterpriseId ?? config.enterpriseId ?? null,
      site_name: edge.site?.name ?? null,
      edge_state: edge.edgeState ?? edge.activationState ?? null,
      activation_state: edge.activationState ?? null,
      model_number: edge.modelNumber ?? null,
      last_contact: edge.lastContact ?? null,
      account_hint: extractAccountHint(edge.name),
    }));

    (payload.customers as any[]).push({
      customer: resolvedCustomer,
      base_url: config.baseUrl,
      enterprise_id: config.enterpriseId ?? null,
      edge_count: records.length,
      records,
    });
  }

  const absolutePath = resolve(process.cwd(), outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, JSON.stringify(payload, null, 2));

  console.log(`✅ Exported VeloCloud edges to ${absolutePath}`);
}

function extractAccountHint(name?: string | null): string | null {
  if (!name) {
    return null;
  }
  const match = name.match(/ACCT\d+/i);
  return match ? match[0].toUpperCase() : null;
}

main().catch((error) => {
  console.error("❌ Failed to export VeloCloud edges:", error);
  process.exit(1);
});
