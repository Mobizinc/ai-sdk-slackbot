/**
 * Delete Allcare Network CIs and Relationships
 *
 * Removes all Allcare firewall-network relationships and network CIs
 * to prepare for recreation following Altus pattern
 *
 * SAFEGUARDS:
 * - Only deletes ACM-* firewall relationships
 * - Only deletes networks for FPA/HDG/CSD/Allcare companies
 * - Does NOT touch Altus data
 *
 * USAGE:
 *   npx tsx scripts/delete-allcare-networks-and-relationships.ts
 *   npx tsx scripts/delete-allcare-networks-and-relationships.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function deleteAllcareNetworksAndRelationships(dryRun: boolean = false) {
  console.log('🗑️  Delete Allcare Network CIs and Relationships');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN - No deletions will occur');
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

  // Step 1: Delete firewall→network relationships for ACM-* firewalls
  console.log('Step 1: Delete Firewall→Network Relationships');
  console.log('─'.repeat(70));
  console.log('');

  const relQuery = `parent.nameLIKEACM-^child.sys_class_name=cmdb_ci_ip_network`;
  const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(relQuery)}&sysparm_limit=200`;

  const relResp = await fetch(relUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const relData = await relResp.json();
  const relationships = relData.result || [];

  console.log(`ACM Firewall→Network Relationships: ${relationships.length}`);

  let relsDeleted = 0;
  for (const rel of relationships) {
    if (dryRun) {
      relsDeleted++;
    } else {
      const deleteUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci/${rel.sys_id}`;
      const deleteResp = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader }
      });

      if (deleteResp.ok || deleteResp.status === 204) {
        relsDeleted++;
      }
    }
  }

  console.log(`${dryRun ? 'Would delete' : 'Deleted'}: ${relsDeleted} relationships`);
  console.log('');

  // Step 2: Delete Allcare network CIs
  console.log('Step 2: Delete Allcare Network CIs');
  console.log('─'.repeat(70));
  console.log('');

  const netQuery = `company=ebf393e683ab8e1068537cdfeeaad3c6^ORcompany=9aa1454a97571550102c79200153afbb^ORcompany=9c14d3e683ab8e1068537cdfeeaad35a^ORcompany=5231c90a97571550102c79200153af04`;
  const netUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=${encodeURIComponent(netQuery)}&sysparm_fields=sys_id,name,company&sysparm_display_value=true&sysparm_limit=200`;

  const netResp = await fetch(netUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const netData = await netResp.json();
  const networks = netData.result || [];

  // Verify no Altus networks in list
  const altusNets = networks.filter((n: any) =>
    n.name.includes('Altus') || n['company.name']?.includes('Altus')
  );

  if (altusNets.length > 0) {
    console.error('⚠️  DANGER: Altus networks found in deletion list!');
    console.error(`Altus networks: ${altusNets.length}`);
    for (const net of altusNets.slice(0, 5)) {
      console.error(`  - ${net.name} (${net['company.name']})`);
    }
    console.error('');
    console.error('❌ ABORTING - Cannot delete Altus networks');
    process.exit(1);
  }

  console.log(`Allcare Network CIs: ${networks.length}`);

  let netsDeleted = 0;
  for (const net of networks) {
    if (dryRun) {
      netsDeleted++;
    } else {
      const deleteUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network/${net.sys_id}`;
      const deleteResp = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader }
      });

      if (deleteResp.ok || deleteResp.status === 204) {
        netsDeleted++;
      }
    }
  }

  console.log(`${dryRun ? 'Would delete' : 'Deleted'}: ${netsDeleted} network CIs`);
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('📊 Deletion Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Relationships Deleted: ${relsDeleted}`);
  console.log(`Network CIs Deleted: ${netsDeleted}`);
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To execute:');
    console.log('  npx tsx scripts/delete-allcare-networks-and-relationships.ts');
  } else {
    console.log('✅ Cleanup complete!');
    console.log('');
    console.log('⚠️  IMPORTANT: Verify Altus data is intact before proceeding');
    console.log('');
    console.log('Next: Recreate networks with location field');
    console.log('  npx tsx scripts/create-allcare-ip-networks-from-interfaces.ts');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

deleteAllcareNetworksAndRelationships(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
