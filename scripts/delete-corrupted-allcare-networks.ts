/**
 * Delete Corrupted Allcare Network CIs
 *
 * Deletes network CIs created today with corrupted company field
 * Identifies by company value containing "{display_value=" string
 *
 * USAGE:
 *   npx tsx scripts/delete-corrupted-allcare-networks.ts
 *   npx tsx scripts/delete-corrupted-allcare-networks.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function deleteCorruptedAllcareNetworks(dryRun: boolean = false) {
  console.log('🗑️  Delete Corrupted Allcare Network CIs');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN - Will identify corrupted networks');
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

  // Query networks created today
  const query = `sys_created_onONToday@javascript:gs.daysAgoStart(0)@javascript:gs.daysAgoEnd(0)`;
  const netUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=sys_id,name,company,network_address,netmask&sysparm_limit=200`;

  const netResp = await fetch(netUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  if (!netResp.ok) {
    console.error(`❌ Failed to query networks: ${netResp.statusText}`);
    process.exit(1);
  }

  const netData = await netResp.json();
  const networks = netData.result || [];

  console.log(`Total Networks Created Today: ${networks.length}`);
  console.log('');

  // Filter to corrupted ones (company field contains "{display_value=")
  const corrupted = networks.filter((net: any) => {
    const companyValue = net.company?.value || net.company || '';
    return typeof companyValue === 'string' && companyValue.includes('{display_value=');
  });

  console.log(`Corrupted Networks (invalid company): ${corrupted.length}`);
  console.log('');

  if (corrupted.length === 0) {
    console.log('✅ No corrupted networks found!');
    return;
  }

  // Verify we're only deleting Allcare networks (not Altus)
  const altusNetworks = corrupted.filter((net: any) => net.name.includes('Altus'));
  if (altusNetworks.length > 0) {
    console.error('⚠️  WARNING: Found Altus networks in deletion list!');
    console.error(`Altus networks: ${altusNetworks.length}`);
    console.error('');
    for (const net of altusNetworks) {
      console.error(`  - ${net.name}`);
    }
    console.error('');
    console.error('❌ ABORTING - Cannot delete Altus networks');
    process.exit(1);
  }

  console.log('🗑️  Networks to Delete (all Allcare):');
  console.log('─'.repeat(70));
  console.log('');

  let deleted = 0, errors = 0;

  for (const net of corrupted) {
    console.log(`${net.name}`);
    console.log(`  Company (corrupted): ${net.company?.value || net.company}`);

    if (dryRun) {
      console.log(`  🧪 Would delete (${net.sys_id.substring(0, 8)}...)`);
      deleted++;
    } else {
      const deleteUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network/${net.sys_id}`;
      const deleteResp = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader }
      });

      if (deleteResp.ok || deleteResp.status === 204) {
        console.log(`  🗑️  Deleted`);
        deleted++;
      } else {
        console.log(`  ❌ Failed`);
        errors++;
      }
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Deletion Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Corrupted Networks: ${corrupted.length}`);
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Errors: ${errors}`);
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To delete:');
    console.log('  npx tsx scripts/delete-corrupted-allcare-networks.ts');
  } else {
    console.log('✅ Cleanup complete!');
    console.log('');
    console.log('Next: Recreate networks with fixed script');
    console.log('  npx tsx scripts/create-allcare-ip-networks-from-interfaces.ts');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

deleteCorruptedAllcareNetworks(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
