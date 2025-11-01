/**
 * EMERGENCY ROLLBACK: Delete Incorrect Allcare→Altus Network Links
 *
 * Deletes all CI relationships where Allcare firewalls (ACM-*) are incorrectly
 * linked to Altus networks
 *
 * USAGE:
 *   npx tsx scripts/rollback-allcare-incorrect-network-links.ts
 *   npx tsx scripts/rollback-allcare-incorrect-network-links.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function rollbackIncorrectNetworkLinks(dryRun: boolean = false) {
  console.log('🚨 EMERGENCY ROLLBACK: Delete Incorrect Allcare Network Links');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN - Will identify relationships to delete');
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

  // Query all relationships where:
  // - Parent is ACM-* firewall (Allcare)
  // - Child is a network CI
  // - Child's company is Altus (WRONG!)
  const query = `parent.nameLIKEACM-^child.sys_class_name=cmdb_ci_ip_network`;
  const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=sys_id,parent.name,child.name,child.company.name&sysparm_display_value=true&sysparm_limit=200`;

  const relResp = await fetch(relUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  if (!relResp.ok) {
    console.error(`❌ Failed to query relationships: ${relResp.statusText}`);
    process.exit(1);
  }

  const relData = await relResp.json();
  const relationships = relData.result || [];

  console.log(`Total ACM Firewall→Network Relationships: ${relationships.length}`);
  console.log('');

  // Filter to incorrect ones (child network belongs to Altus)
  const incorrect = relationships.filter((rel: any) => {
    const networkCompany = rel['child.company.name'] || '';
    return networkCompany.includes('Altus');
  });

  console.log(`Incorrect (linked to Altus networks): ${incorrect.length}`);
  console.log('');

  if (incorrect.length === 0) {
    console.log('✅ No incorrect relationships found!');
    return;
  }

  console.log('🗑️  Relationships to Delete:');
  console.log('─'.repeat(70));
  console.log('');

  let deleted = 0, errors = 0;

  for (const rel of incorrect) {
    console.log(`${rel['parent.name']} → ${rel['child.name']}`);
    console.log(`  Network Company: ${rel['child.company.name']} (WRONG - should be Allcare/FPA/HDG/CSD)`);

    if (dryRun) {
      console.log(`  🧪 Would delete (${rel.sys_id.substring(0, 8)}...)`);
      deleted++;
    } else {
      const deleteUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci/${rel.sys_id}`;
      const deleteResp = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader }
      });

      if (deleteResp.ok || deleteResp.status === 204) {
        console.log(`  🗑️  Deleted`);
        deleted++;
      } else {
        console.log(`  ❌ Failed to delete`);
        errors++;
      }
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Rollback Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Incorrect Relationships: ${incorrect.length}`);
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Errors: ${errors}`);
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To delete incorrect relationships:');
    console.log('  npx tsx scripts/rollback-allcare-incorrect-network-links.ts');
  } else {
    console.log('✅ Rollback complete!');
    console.log('');
    console.log('⚠️  WARNING: Allcare networks may not exist yet');
    console.log('You need to create Allcare-specific network CIs before re-linking');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

rollbackIncorrectNetworkLinks(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
