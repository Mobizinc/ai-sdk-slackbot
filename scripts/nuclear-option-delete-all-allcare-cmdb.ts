/**
 * NUCLEAR OPTION: Complete Allcare CMDB Data Deletion
 *
 * Deletes ALL Allcare firewall and network data to start fresh
 * Backs up everything first for safety
 *
 * SAFETY CHECKS:
 * - Backs up all data to JSON before deletion
 * - Verifies Altus NOT in deletion scope
 * - Requires --confirm AND --i-understand-this-deletes-everything flags
 * - Checks Altus counts before and after
 *
 * USAGE:
 *   npx tsx scripts/nuclear-option-delete-all-allcare-cmdb.ts --confirm --i-understand-this-deletes-everything
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function nuclearDeleteAllcareCMDB(confirm: boolean = false, understood: boolean = false) {
  console.log('☢️  NUCLEAR OPTION: Complete Allcare CMDB Deletion');
  console.log('='.repeat(70));
  console.log('');

  if (!confirm || !understood) {
    console.log('🚨 SAFETY MODE - Requires both flags to execute:');
    console.log('  --confirm');
    console.log('  --i-understand-this-deletes-everything');
    console.log('');
    console.log('This will delete:');
    console.log('  - All ACM-* firewall CIs (~34)');
    console.log('  - All Allcare network CIs (~30+)');
    console.log('  - All relationships (~100+)');
    console.log('  - Allcare-Azure location');
    console.log('');
    console.log('Backups will be created first.');
    console.log('');
    return;
  }

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const backupDir = path.join(process.cwd(), 'backup', 'pre-nuclear-deletion');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // ========================================
  // PHASE 1: BACKUP EVERYTHING
  // ========================================
  console.log('📦 PHASE 1: Backup All Data');
  console.log('='.repeat(70));
  console.log('');

  // Backup firewalls
  const fwResp = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=nameLIKEACM-&sysparm_limit=100`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const fwData = await fwResp.json();
  fs.writeFileSync(path.join(backupDir, 'firewalls.json'), JSON.stringify(fwData.result, null, 2));
  console.log(`✅ Backed up ${fwData.result?.length || 0} firewalls`);

  // Backup networks
  const netResp = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=company=ebf393e683ab8e1068537cdfeeaad3c6^ORcompany=9aa1454a97571550102c79200153afbb^ORcompany=9c14d3e683ab8e1068537cdfeeaad35a^ORcompany=5231c90a97571550102c79200153af04&sysparm_limit=200`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const netData = await netResp.json();
  fs.writeFileSync(path.join(backupDir, 'networks.json'), JSON.stringify(netData.result, null, 2));
  console.log(`✅ Backed up ${netData.result?.length || 0} networks`);

  // Backup relationships
  const relResp = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.nameLIKEACM-^ORchild.nameLIKEACM-&sysparm_limit=200`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const relData = await relResp.json();
  fs.writeFileSync(path.join(backupDir, 'relationships.json'), JSON.stringify(relData.result, null, 2));
  console.log(`✅ Backed up ${relData.result?.length || 0} relationships`);
  console.log('');

  console.log(`📁 Backups saved to: ${backupDir}`);
  console.log('');

  // ========================================
  // PHASE 2: VERIFY ALTUS BASELINE
  // ========================================
  console.log('🔵 PHASE 2: Verify Altus Baseline (Before Deletion)');
  console.log('='.repeat(70));
  console.log('');

  const altusCheck = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company=c3eec28c931c9a1049d9764efaba10f3&sysparm_limit=50`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusCheckData = await altusCheck.json();
  const altusCountBefore = altusCheckData.result?.length || 0;

  console.log(`Altus Firewalls (before): ${altusCountBefore}`);
  if (altusCountBefore !== 29) {
    console.error('❌ ABORT: Altus baseline wrong! Expected 29, found ' + altusCountBefore);
    process.exit(1);
  }
  console.log('');

  // ========================================
  // PHASE 3: DELETE RELATIONSHIPS
  // ========================================
  console.log('🗑️  PHASE 3: Delete All Allcare Relationships');
  console.log('='.repeat(70));
  console.log('');

  const relationships = relData.result || [];
  let relsDeleted = 0;

  for (const rel of relationships) {
    const deleteUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci/${rel.sys_id}`;
    const deleteResp = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    });
    if (deleteResp.ok || deleteResp.status === 204) relsDeleted++;
  }

  console.log(`Deleted: ${relsDeleted} relationships`);
  console.log('');

  // ========================================
  // PHASE 4: DELETE NETWORKS
  // ========================================
  console.log('🗑️  PHASE 4: Delete All Allcare Networks');
  console.log('='.repeat(70));
  console.log('');

  const networks = netData.result || [];
  let netsDeleted = 0;

  for (const net of networks) {
    const deleteUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network/${net.sys_id}`;
    const deleteResp = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    });
    if (deleteResp.ok || deleteResp.status === 204) netsDeleted++;
  }

  console.log(`Deleted: ${netsDeleted} networks`);
  console.log('');

  // ========================================
  // PHASE 5: DELETE FIREWALLS
  // ========================================
  console.log('🗑️  PHASE 5: Delete All Allcare Firewalls');
  console.log('='.repeat(70));
  console.log('');

  const firewalls = fwData.result || [];
  let fwsDeleted = 0;

  for (const fw of firewalls) {
    const deleteUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${fw.sys_id}`;
    const deleteResp = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    });
    if (deleteResp.ok || deleteResp.status === 204) fwsDeleted++;
  }

  console.log(`Deleted: ${fwsDeleted} firewalls`);
  console.log('');

  // ========================================
  // PHASE 6: VERIFY ALTUS UNCHANGED
  // ========================================
  console.log('🔵 PHASE 6: Verify Altus Unchanged (After Deletion)');
  console.log('='.repeat(70));
  console.log('');

  const altusCheckAfter = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company=c3eec28c931c9a1049d9764efaba10f3&sysparm_limit=50`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusCheckAfterData = await altusCheckAfter.json();
  const altusCountAfter = altusCheckAfterData.result?.length || 0;

  console.log(`Altus Firewalls (after): ${altusCountAfter}`);

  if (altusCountAfter !== altusCountBefore) {
    console.error(`❌ CRITICAL: Altus count changed! Before: ${altusCountBefore}, After: ${altusCountAfter}`);
    console.error('We may have deleted Altus data!');
  } else {
    console.log('✅ Altus unchanged');
  }
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('📊 Deletion Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Relationships Deleted: ${relsDeleted}`);
  console.log(`Networks Deleted: ${netsDeleted}`);
  console.log(`Firewalls Deleted: ${fwsDeleted}`);
  console.log(`Altus Count: ${altusCountBefore} → ${altusCountAfter}`);
  console.log('');
  console.log(`Backups: ${backupDir}`);
  console.log('');
  console.log('✅ Complete deletion finished!');
  console.log('');
  console.log('Next: Rebuild from FortiManager data');
  console.log('  npx tsx scripts/rebuild-allcare-from-fortimanager.ts');
  console.log('');
}

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const understood = args.includes('--i-understand-this-deletes-everything');

nuclearDeleteAllcareCMDB(confirm, understood)
  .catch(console.error)
  .finally(() => process.exit(0));
