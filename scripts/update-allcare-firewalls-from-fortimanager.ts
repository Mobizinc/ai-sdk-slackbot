/**
 * Update Allcare Firewalls from FortiManager Data
 *
 * Enriches existing ServiceNow firewall CIs with accurate data from FortiManager
 * Follows the same pattern used for Altus firewall enrichment
 *
 * PREREQUISITES:
 * - FortiManager discovery complete (allcare-firewalls.json)
 * - Name mapping table created (allcare-name-mapping.csv)
 * - ServiceNow credentials in .env.local
 *
 * USAGE:
 *   npx tsx scripts/update-allcare-firewalls-from-fortimanager.ts
 *   npx tsx scripts/update-allcare-firewalls-from-fortimanager.ts --dry-run
 *
 * ACTIONS:
 * - Updates serial_number, ip_address, model, operational_status
 * - Cleans up corrupted short_description fields
 * - Adds GPS coordinates (latitude/longitude)
 * - Flags duplicates for manual review
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface NameMapping {
  servicenow_sys_id: string;
  servicenow_name: string;
  fortimanager_name: string;
  fortimanager_serial: string;
  match_confidence: string;
  notes: string;
}

interface FortiManagerFirewall {
  name: string;
  serial_number: string;
  model: string;
  management_ip: string;
  public_ip_scope: string[];
  internal_ip_scope: string[];
  status: string;
  connection_status: string;
  config_status: string;
  firmware_version: number | string;
  location?: string;
  latitude?: string;
  longitude?: string;
}

function parseCSV(csvContent: string): NameMapping[] {
  const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  const headers = lines[0].split(',').map(h => h.trim());

  const records: NameMapping[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    const record: any = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || '';
    });

    records.push(record as NameMapping);
  }

  return records;
}

async function updateAllcareFirewallsFromFortiManager(dryRun: boolean = false) {
  console.log('🔥 Update Allcare Firewalls from FortiManager Data');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE - No changes will be made');
    console.log('');
  }

  // Load FortiManager discovery data
  const discoveryPath = path.join(process.cwd(), 'backup', 'fortimanager-discovery', 'allcare-firewalls.json');
  if (!fs.existsSync(discoveryPath)) {
    console.error(`❌ FortiManager discovery file not found: ${discoveryPath}`);
    console.error('');
    console.error('Run first:');
    console.error('  NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare');
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf-8'));
  const fmgFirewalls: FortiManagerFirewall[] = discovery.firewalls || [];

  console.log(`FortiManager Firewalls: ${fmgFirewalls.length}`);

  // Load name mapping table
  const mappingPath = path.join(process.cwd(), 'config', 'fortimanager', 'allcare-name-mapping.csv');
  if (!fs.existsSync(mappingPath)) {
    console.error(`❌ Name mapping table not found: ${mappingPath}`);
    process.exit(1);
  }

  const mappingContent = fs.readFileSync(mappingPath, 'utf-8');
  const mappings = parseCSV(mappingContent);

  console.log(`Name Mappings: ${mappings.length}`);
  console.log('');

  // Create lookup map: FortiManager name → mapping
  const fmgNameMap = new Map<string, NameMapping>();
  for (const mapping of mappings) {
    fmgNameMap.set(mapping.fortimanager_name, mapping);
  }

  // Create lookup map: FortiManager name → firewall data
  const fmgDataMap = new Map<string, FortiManagerFirewall>();
  for (const fw of fmgFirewalls) {
    fmgDataMap.set(fw.name, fw);
  }

  // ServiceNow credentials
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  if (environment === 'PRODUCTION' && !dryRun) {
    console.log('⚠️  WARNING: Updating records in PRODUCTION');
    console.log('');
  }

  let updated = 0, skipped = 0, errors = 0, duplicates = 0;

  // Process each mapping
  for (const mapping of mappings) {
    // Skip if marked as duplicate
    if (mapping.notes.includes('DUPLICATE') && mapping.notes.includes('to be deleted')) {
      console.log(`${mapping.servicenow_name} (${mapping.servicenow_sys_id.substring(0, 8)}...)`);
      console.log(`  🗑️  DUPLICATE - Flagged for deletion (${mapping.notes})`);
      duplicates++;
      continue;
    }

    // Skip if duplicate but keep
    if (mapping.notes.includes('DUPLICATE') && mapping.notes.includes('KEEP')) {
      console.log(`${mapping.servicenow_name} (${mapping.servicenow_sys_id.substring(0, 8)}...)`);
      console.log(`  ✅ DUPLICATE - Keep this entry (already has FortiManager data)`);
      skipped++;
      continue;
    }

    // Get FortiManager data
    const fmgData = fmgDataMap.get(mapping.fortimanager_name);
    if (!fmgData) {
      console.log(`${mapping.servicenow_name}`);
      console.log(`  ⚠️  No FortiManager data found for ${mapping.fortimanager_name}`);
      errors++;
      continue;
    }

    console.log(`${mapping.servicenow_name} → ${mapping.fortimanager_name}`);

    // Build update payload
    const updatePayload: any = {
      serial_number: fmgData.serial_number,
      ip_address: fmgData.management_ip,
      operational_status: fmgData.status === 'online' ? '1' : '2',
      short_description: buildDescription(fmgData),
      asset_tag: fmgData.serial_number
    };

    // Add GPS coordinates if available
    if (fmgData.latitude && fmgData.longitude) {
      updatePayload.latitude = fmgData.latitude;
      updatePayload.longitude = fmgData.longitude;
    }

    console.log(`  📝 Serial: ${fmgData.serial_number}`);
    console.log(`  📍 IP: ${fmgData.management_ip}`);
    console.log(`  📊 Status: ${fmgData.status}`);
    if (fmgData.location) {
      console.log(`  🗺️  Location: ${fmgData.location}`);
    }

    if (dryRun) {
      console.log(`  🧪 DRY RUN - Would update CI`);
      updated++;
    } else {
      // Update ServiceNow CI
      const updateUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${mapping.servicenow_sys_id}`;
      const updateResp = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      });

      if (updateResp.ok) {
        console.log(`  ✅ Updated`);
        updated++;
      } else {
        const errorText = await updateResp.text();
        console.log(`  ❌ Failed: ${errorText}`);
        errors++;
      }
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Update Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Total Mappings: ${mappings.length}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Duplicates Flagged: ${duplicates}`);
  console.log(`  Errors: ${errors}`);
  console.log('');

  if (duplicates > 0 && !dryRun) {
    console.log('─'.repeat(70));
    console.log('🗑️  Duplicate Cleanup Required');
    console.log('─'.repeat(70));
    console.log('');
    console.log(`${duplicates} duplicate CI(s) flagged for deletion`);
    console.log('Review and delete manually in ServiceNow or create cleanup script');
    console.log('');
  }

  if (dryRun) {
    console.log('─'.repeat(70));
    console.log('💡 Next Steps');
    console.log('─'.repeat(70));
    console.log('');
    console.log('Dry run complete. To apply changes:');
    console.log('  npx tsx scripts/update-allcare-firewalls-from-fortimanager.ts');
    console.log('');
  }
}

function buildDescription(fw: FortiManagerFirewall): string {
  const parts = [
    `FortiGate firewall: ${fw.name}`,
    `Model: ${fw.model}`,
    `Serial: ${fw.serial_number}`
  ];

  if (fw.location) {
    parts.push(`Location: ${fw.location}`);
  }

  if (fw.public_ip_scope && fw.public_ip_scope.length > 0) {
    parts.push(`Public IPs: ${fw.public_ip_scope.join(', ')}`);
  }

  if (fw.internal_ip_scope && fw.internal_ip_scope.length > 0) {
    parts.push(`Internal IPs: ${fw.internal_ip_scope.join(', ')}`);
  }

  if (fw.firmware_version) {
    parts.push(`Firmware: v${fw.firmware_version}`);
  }

  return parts.join('. ');
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

updateAllcareFirewallsFromFortiManager(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
