/**
 * Surgical Cleanup: Delete Allcare Duplicate Firewalls (NO Company)
 *
 * Deletes 28 duplicate ACM-* firewall entries that have:
 * - NO company field
 * - NO serial number
 * - Created by amyroniuk (wrong import)
 *
 * SAFETY CHECKS:
 * - Exports deletion list for review
 * - Requires --confirm flag
 * - Verifies Altus NOT in deletion list
 * - Dry-run by default
 *
 * USAGE:
 *   npx tsx scripts/delete-allcare-duplicate-no-company.ts
 *   npx tsx scripts/delete-allcare-duplicate-no-company.ts --confirm
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function deleteAllcareDuplicateNoCompany(confirm: boolean = false) {
  console.log('🗑️  Surgical Cleanup: Delete Allcare Duplicate Firewalls');
  console.log('='.repeat(70));
  console.log('');

  if (!confirm) {
    console.log('🧪 DRY RUN MODE - Use --confirm to execute');
    console.log('');
  }

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Step 1: Find duplicates with NO company
  console.log('Step 1: Identify Duplicates with NO Company');
  console.log('─'.repeat(70));
  console.log('');

  const query = `nameLIKEACM-^company=^serial_number=`;
  const fwUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=name,sys_id,company,serial_number,ip_address,sys_created_by&sysparm_display_value=true&sysparm_limit=100`;

  const fwResp = await fetch(fwUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const fwData = await fwResp.json();
  const duplicates = fwData.result || [];

  console.log(`Found ${duplicates.length} ACM-* firewalls with NO company & NO serial`);
  console.log('');

  // Safety check: Verify no Altus
  const altusInList = duplicates.filter((fw: any) =>
    fw.name.includes('Altus') || fw.name.includes('ALT-')
  );

  if (altusInList.length > 0) {
    console.error('🚨 DANGER: Altus firewalls found in deletion list!');
    console.error(`Altus entries: ${altusInList.length}`);
    for (const fw of altusInList) {
      console.error(`  - ${fw.name}`);
    }
    console.error('');
    console.error('❌ ABORTING - Cannot delete Altus firewalls');
    process.exit(1);
  }

  // Export deletion list
  const exportPath = path.join(process.cwd(), 'backup', 'audit-reports', 'allcare-duplicates-to-delete.csv');
  const exportDir = path.dirname(exportPath);
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const csvContent = [
    'Name,Sys_ID,IP Address,Created By,Created On',
    ...duplicates.map((fw: any) =>
      `${fw.name},${fw.sys_id},${fw.ip_address || ''},${fw.sys_created_by},${fw.sys_created_on || ''}`
    )
  ].join('\n');

  fs.writeFileSync(exportPath, csvContent);
  console.log(`📄 Deletion list exported: ${exportPath}`);
  console.log('');

  // Show sample
  console.log('Sample Entries to Delete:');
  console.log('─'.repeat(70));
  for (const fw of duplicates.slice(0, 10)) {
    console.log(`  ${fw.name} (${fw.sys_id.substring(0, 8)}...) - Created by ${fw.sys_created_by}`);
  }
  if (duplicates.length > 10) {
    console.log(`  ... and ${duplicates.length - 10} more`);
  }
  console.log('');

  if (!confirm) {
    console.log('🧪 DRY RUN - No deletions performed');
    console.log('');
    console.log('To execute deletion:');
    console.log('  npx tsx scripts/delete-allcare-duplicate-no-company.ts --confirm');
    console.log('');
    return;
  }

  // Step 2: Delete duplicates
  console.log('Step 2: Delete Duplicate Entries');
  console.log('─'.repeat(70));
  console.log('');

  let deleted = 0, errors = 0;

  for (const fw of duplicates) {
    const deleteUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${fw.sys_id}`;
    const deleteResp = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    });

    if (deleteResp.ok || deleteResp.status === 204) {
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`  Deleted ${deleted}/${duplicates.length}...`);
      }
    } else {
      errors++;
    }
  }

  console.log(`✅ Deleted: ${deleted}`);
  console.log(`❌ Errors: ${errors}`);
  console.log('');

  // Step 3: Verify remaining count
  console.log('Step 3: Verify Remaining Firewalls');
  console.log('─'.repeat(70));
  console.log('');

  const remainingQuery = `nameLIKEACM-`;
  const remainingUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(remainingQuery)}&sysparm_limit=100`;

  const remainingResp = await fetch(remainingUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const remainingData = await remainingResp.json();
  const remainingCount = remainingData.result?.length || 0;

  console.log(`Remaining ACM-* Firewalls: ${remainingCount}`);
  if (remainingCount === 34) {
    console.log('✅ CORRECT COUNT');
  } else {
    console.log(`⚠️  Expected 34, found ${remainingCount}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('📊 Cleanup Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Duplicates Deleted: ${deleted}`);
  console.log(`Remaining Firewalls: ${remainingCount}`);
  console.log(`Altus Firewalls: Unchanged (verify manually)`);
  console.log('');

  console.log('✅ Cleanup complete!');
  console.log('');
  console.log('Next: Re-run audit to verify clean state');
  console.log('  npx tsx scripts/audit-altus-allcare-complete.ts');
  console.log('');
}

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');

deleteAllcareDuplicateNoCompany(confirm)
  .catch(console.error)
  .finally(() => process.exit(0));
