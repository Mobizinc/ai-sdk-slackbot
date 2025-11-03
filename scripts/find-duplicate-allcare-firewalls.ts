/**
 * Find Duplicate Allcare Firewall Entries
 *
 * Identifies firewall CIs with duplicate serial numbers
 * Shows which entries have correct company/location vs which need deletion
 *
 * USAGE:
 *   npx tsx scripts/find-duplicate-allcare-firewalls.ts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function findDuplicateAllcareFirewalls() {
  console.log('🔍 Find Duplicate Allcare Firewall Entries');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Query all Allcare-related firewalls (including sibling companies)
  const queryUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company.nameLIKEAllcare^ORcompany.nameLIKEFPA^ORcompany.nameLIKEHospitality^ORcompany.nameLIKECal Select&sysparm_fields=name,sys_id,serial_number,company.name,location.name,sys_created_on,sys_created_by,ip_address&sysparm_display_value=true&sysparm_limit=150`;

  const response = await fetch(queryUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error(`❌ Failed to query ServiceNow: ${response.statusText}`);
    process.exit(1);
  }

  const data = await response.json();
  const firewalls = data.result || [];

  console.log(`Total Firewall CIs Found: ${firewalls.length}`);
  console.log('');

  // Group by serial number
  const bySerial = new Map<string, any[]>();

  for (const fw of firewalls) {
    const serial = fw.serial_number || '';
    if (!serial.trim()) continue;  // Skip entries without serial

    if (!bySerial.has(serial)) {
      bySerial.set(serial, []);
    }
    bySerial.get(serial)!.push(fw);
  }

  // Find duplicates (serial number appears more than once)
  const duplicates = Array.from(bySerial.entries()).filter(([serial, entries]) => entries.length > 1);

  console.log(`Firewalls with Serial Numbers: ${bySerial.size}`);
  console.log(`Duplicate Serial Numbers: ${duplicates.length}`);
  console.log('');

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  console.log('─'.repeat(70));
  console.log('🔄 Duplicate Entries');
  console.log('─'.repeat(70));
  console.log('');

  const mergeActions: any[] = [];

  for (const [serial, entries] of duplicates) {
    console.log(`Serial: ${serial} (${entries.length} entries)`);
    console.log('');

    // Analyze each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const hasCompany = entry['company.name'] && !entry['company.name'].includes('Allcare Medical Management, Inc.');
      const hasLocation = entry['location.name'] && entry['location.name'].trim().length > 0;
      const hasIP = entry.ip_address && entry.ip_address.trim().length > 0;

      const score = (hasCompany ? 2 : 0) + (hasLocation ? 2 : 0) + (hasIP ? 1 : 0);
      const action = score >= 4 ? '✅ KEEP' : score >= 2 ? '⚠️  REVIEW' : '🗑️  DELETE';

      console.log(`  ${i + 1}. ${entry.name}`);
      console.log(`     sys_id: ${entry.sys_id}`);
      console.log(`     Company: ${entry['company.name'] || '(none)'}`);
      console.log(`     Location: ${entry['location.name'] || '(none)'}`);
      console.log(`     IP: ${entry.ip_address || '(none)'}`);
      console.log(`     Created by: ${entry.sys_created_by}`);
      console.log(`     → ${action} (score: ${score}/5)`);
      console.log('');

      mergeActions.push({
        serial_number: serial,
        sys_id: entry.sys_id,
        name: entry.name,
        company: entry['company.name'] || '',
        location: entry['location.name'] || '',
        ip_address: entry.ip_address || '',
        created_by: entry.sys_created_by,
        score,
        recommended_action: score >= 4 ? 'KEEP' : score >= 2 ? 'REVIEW' : 'DELETE'
      });
    }

    console.log('─'.repeat(70));
    console.log('');
  }

  // Summary
  const toKeep = mergeActions.filter(a => a.recommended_action === 'KEEP');
  const toDelete = mergeActions.filter(a => a.recommended_action === 'DELETE');
  const toReview = mergeActions.filter(a => a.recommended_action === 'REVIEW');

  console.log('📊 Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Total Duplicate Entries: ${mergeActions.length}`);
  console.log(`  ✅ KEEP (good company + location): ${toKeep.length}`);
  console.log(`  🗑️  DELETE (missing company/location): ${toDelete.length}`);
  console.log(`  ⚠️  REVIEW (partial data): ${toReview.length}`);
  console.log('');

  // Export merge plan
  const outputPath = path.join(process.cwd(), 'backup', 'fortimanager-discovery', 'allcare-duplicate-merge-plan.json');
  const mergeplan = {
    discovered_at: new Date().toISOString(),
    total_duplicates: duplicates.length,
    total_entries: mergeActions.length,
    to_keep: toKeep.length,
    to_delete: toDelete.length,
    to_review: toReview.length,
    actions: mergeActions
  };

  fs.writeFileSync(outputPath, JSON.stringify(mergeplan, null, 2));
  console.log(`💾 Merge plan saved: ${outputPath}`);
  console.log('');

  console.log('─'.repeat(70));
  console.log('💡 Next Steps');
  console.log('─'.repeat(70));
  console.log('');
  console.log('1. Review merge plan:');
  console.log(`   cat ${outputPath} | jq .`);
  console.log('');
  console.log('2. Execute merge:');
  console.log('   npx tsx scripts/merge-duplicate-allcare-firewalls.ts');
  console.log('');
}

findDuplicateAllcareFirewalls()
  .catch(console.error)
  .finally(() => process.exit(0));
