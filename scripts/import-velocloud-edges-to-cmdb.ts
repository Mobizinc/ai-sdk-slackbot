/**
 * Import VeloCloud Edges into ServiceNow CMDB
 *
 * Reads edges from ci-records/velocloud-edges.json and creates Configuration Items
 * in ServiceNow CMDB (class: cmdb_ci_carrier_device)
 *
 * Usage:
 *   pnpm tsx scripts/import-velocloud-edges-to-cmdb.ts
 *   pnpm tsx scripts/import-velocloud-edges-to-cmdb.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env.local' });

interface VeloCloudEdge {
  edge_id: number;
  edge_name: string;
  logical_id: string;
  enterprise_id: number;
  site_name: string | null;
  edge_state: string;
  activation_state: string;
  model_number: string;
  last_contact: string;
  account_hint: string | null;
}

interface VeloCloudInventory {
  generated_at: string;
  source: string;
  customers: Array<{
    customer: string;
    base_url: string;
    enterprise_id: number | null;
    edge_count: number;
    records: VeloCloudEdge[];
  }>;
}

async function importVeloCloudEdges() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🌐 Import VeloCloud Edges to ServiceNow CMDB');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('');
  }

  // Load ServiceNow credentials
  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.error('   Required: SERVICENOW_INSTANCE_URL, SERVICENOW_USERNAME, SERVICENOW_PASSWORD');
    process.exit(1);
  }

  console.log(`Instance: ${instanceUrl}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Load VeloCloud inventory
  const inventoryPath = join(process.cwd(), 'ci-records', 'velocloud-edges.json');
  let inventory: VeloCloudInventory;

  try {
    const rawData = readFileSync(inventoryPath, 'utf-8');
    inventory = JSON.parse(rawData);
    console.log(`✅ Loaded inventory from: ${inventoryPath}`);
    console.log(`   Generated: ${inventory.generated_at}`);
    console.log(`   Customers: ${inventory.customers.length}`);
    console.log('');
  } catch (error) {
    console.error(`❌ Failed to load inventory: ${error}`);
    process.exit(1);
  }

  // Get all edges
  const allEdges = inventory.customers.flatMap((customer) => customer.records);
  console.log(`Total edges to import: ${allEdges.length}`);
  console.log('');

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const edge of allEdges) {
    // Map VeloCloud edge to ServiceNow CI
    const ciPayload = {
      name: edge.edge_name,
      serial_number: edge.logical_id,
      model_number: edge.model_number,
      manufacturer: 'VMware', // VeloCloud is owned by VMware
      operational_status: edge.edge_state === 'CONNECTED' ? '1' : '2', // 1=Operational, 2=Non-Operational
      install_status: edge.activation_state === 'ACTIVATED' ? '1' : '6', // 1=Installed, 6=Pending Install
      u_edge_state: edge.edge_state,
      u_activation_state: edge.activation_state,
      u_account_number: edge.account_hint,
      u_site_name: edge.site_name,
      u_enterprise_id: edge.enterprise_id.toString(),
      last_discovered: edge.last_contact !== '0000-00-00 00:00:00' ? edge.last_contact : null,
      short_description: `VeloCloud SD-WAN Edge - ${edge.site_name || edge.edge_name}`,
      comments: `VeloCloud Edge ID: ${edge.edge_id}\\nLogical ID: ${edge.logical_id}\\nEnterprise: ${edge.enterprise_id}`,
    };

    console.log(`Processing: ${edge.edge_name}`);
    console.log(`  State: ${edge.edge_state} | Activation: ${edge.activation_state}`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would create CI with:`);
      console.log(`    Name: ${ciPayload.name}`);
      console.log(`    Serial: ${ciPayload.serial_number}`);
      console.log(`    Model: ${ciPayload.model_number}`);
      skipped++;
      console.log('');
      continue;
    }

    try {
      // Check if edge already exists by serial number
      const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_carrier_device?sysparm_query=serial_number=${encodeURIComponent(edge.logical_id)}&sysparm_limit=1`;
      const checkResponse = await fetch(checkUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        if (checkData.result && checkData.result.length > 0) {
          console.log(`  ⏭️  Already exists (sys_id: ${checkData.result[0].sys_id})`);
          skipped++;
          console.log('');
          continue;
        }
      }

      // Create CI
      const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_carrier_device`;
      const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ciPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  ❌ Failed: ${response.status}`);
        console.error(`     ${errorText.substring(0, 200)}`);
        errors++;
      } else {
        const responseData = await response.json();
        const sysId = responseData.result.sys_id;
        console.log(`  ✅ Created (sys_id: ${sysId})`);
        created++;
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      errors++;
    }

    console.log('');
  }

  // Summary
  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total edges: ${allEdges.length}`);
  console.log(`✅ Created: ${created}`);
  console.log(`⏭️  Skipped (already exist): ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log('');

  if (!dryRun && created > 0) {
    console.log('Next Steps:');
    console.log('  1. Run: pnpm tsx scripts/create-edge-firewall-relationships.ts');
    console.log('  2. Verify edges appear in ServiceNow CMDB');
    console.log('  3. Check relationships are created correctly');
  }

  if (dryRun) {
    console.log('To actually import, run without --dry-run flag');
  }
}

importVeloCloudEdges()
  .catch(console.error)
  .finally(() => process.exit(0));
