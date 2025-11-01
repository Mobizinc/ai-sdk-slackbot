/**
 * Merge Duplicate Allcare Firewall Entries
 *
 * Strategy:
 * 1. Keep entries with correct company + location (from abutt - April 2025)
 * 2. Enrich kept entries with FortiManager data (management IPs, GPS, descriptions)
 * 3. Delete entries with wrong company/no location (from amyroniuk - June 2025)
 *
 * USAGE:
 *   npx tsx scripts/merge-duplicate-allcare-firewalls.ts
 *   npx tsx scripts/merge-duplicate-allcare-firewalls.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function mergeDuplicateAllcareFirewalls(dryRun: boolean = false) {
  console.log('🔄 Merge Duplicate Allcare Firewall Entries');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE - No changes will be made');
    console.log('');
  }

  // Load merge plan
  const mergePlanPath = path.join(process.cwd(), 'backup', 'fortimanager-discovery', 'allcare-duplicate-merge-plan.json');
  if (!fs.existsSync(mergePlanPath)) {
    console.error(`❌ Merge plan not found: ${mergePlanPath}`);
    console.error('');
    console.error('Run first:');
    console.error('  npx tsx scripts/find-duplicate-allcare-firewalls.ts');
    process.exit(1);
  }

  const mergePlan = JSON.parse(fs.readFileSync(mergePlanPath, 'utf-8'));
  const actions = mergePlan.actions || [];

  console.log(`Total Actions: ${actions.length}`);
  console.log(`  KEEP: ${mergePlan.to_keep}`);
  console.log(`  DELETE: ${mergePlan.to_delete}`);
  console.log('');

  // Load FortiManager discovery data
  const fmgPath = path.join(process.cwd(), 'backup', 'fortimanager-discovery', 'allcare-firewalls.json');
  const fmgData = JSON.parse(fs.readFileSync(fmgPath, 'utf-8'));
  const fmgFirewalls = fmgData.firewalls || [];

  // Create serial number → FortiManager data map
  const fmgMap = new Map();
  for (const fw of fmgFirewalls) {
    fmgMap.set(fw.serial_number, fw);
  }

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  let enriched = 0, deleted = 0, errors = 0;

  // Group actions by serial number
  const bySerial = new Map();
  for (const action of actions) {
    if (!bySerial.has(action.serial_number)) {
      bySerial.set(action.serial_number, []);
    }
    bySerial.get(action.serial_number).push(action);
  }

  for (const [serial, entries] of bySerial) {
    const keep = entries.find((e: any) => e.recommended_action === 'KEEP');
    const deletes = entries.filter((e: any) => e.recommended_action === 'DELETE');

    if (!keep) {
      console.log(`⚠️  No KEEP entry for serial ${serial} - skipping`);
      continue;
    }

    console.log(`${keep.name} (${serial})`);

    // Get FortiManager data
    const fmgData = fmgMap.get(serial);
    if (!fmgData) {
      console.log(`  ⚠️  No FortiManager data - skipping enrichment`);
    } else {
      // Enrich the KEEP entry with FortiManager data
      const updatePayload: any = {
        ip_address: fmgData.management_ip,
        short_description: buildDescription(fmgData),
        operational_status: fmgData.status === 'online' ? '1' : '2'
      };

      // Add GPS if available
      if (fmgData.latitude && fmgData.longitude) {
        updatePayload.latitude = fmgData.latitude;
        updatePayload.longitude = fmgData.longitude;
      }

      if (dryRun) {
        console.log(`  🧪 Would enrich with FortiManager data (IP: ${fmgData.management_ip})`);
      } else {
        const updateUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${keep.sys_id}`;
        const updateResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        });

        if (updateResp.ok) {
          console.log(`  ✅ Enriched with FortiManager data (IP: ${fmgData.management_ip})`);
          enriched++;
        } else {
          console.log(`  ❌ Failed to enrich`);
          errors++;
        }
      }
    }

    // Delete the duplicate entries
    for (const del of deletes) {
      if (dryRun) {
        console.log(`  🧪 Would delete: ${del.name} (${del.sys_id.substring(0, 8)}...)`);
      } else {
        const deleteUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${del.sys_id}`;
        const deleteResp = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: { 'Authorization': authHeader }
        });

        if (deleteResp.ok || deleteResp.status === 204) {
          console.log(`  🗑️  Deleted: ${del.name}`);
          deleted++;
        } else {
          console.log(`  ❌ Failed to delete: ${del.name}`);
          errors++;
        }
      }
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Merge Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Entries Enriched: ${enriched}`);
  console.log(`Entries Deleted: ${deleted}`);
  console.log(`Errors: ${errors}`);
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To apply changes:');
    console.log('  npx tsx scripts/merge-duplicate-allcare-firewalls.ts');
    console.log('');
  } else {
    console.log('✅ Merge complete!');
    console.log('');
    console.log('Next: Validate firewall linkages');
    console.log('  npx tsx scripts/validate-allcare-firewall-linkages-final.ts');
    console.log('');
  }
}

function buildDescription(fw: any): string {
  const parts = [
    `FortiGate firewall: ${fw.name}`,
    `Model: ${fw.model}`,
    `Serial: ${fw.serial_number}`
  ];

  if (fw.location) {
    parts.push(`GPS: ${fw.location}`);
  }

  if (fw.firmware_version) {
    parts.push(`Firmware: v${fw.firmware_version}`);
  }

  return parts.join('. ');
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

mergeDuplicateAllcareFirewalls(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
