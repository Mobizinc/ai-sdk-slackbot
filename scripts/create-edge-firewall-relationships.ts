/**
 * Create Edge-Firewall Relationships in ServiceNow CMDB
 * Links VeloCloud edges to their corresponding firewalls using cmdb_rel_ci table
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function createEdgeFirewallRelationships() {
  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Step 1: Get all VeloCloud edges from CMDB
  const edgesUrl = `${instanceUrl}/api/now/table/cmdb_ci_carrier_device?sysparm_query=manufacturer=VMware&sysparm_fields=sys_id,name,u_account_number&sysparm_limit=100`;

  const edgesResponse = await fetch(edgesUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  if (!edgesResponse.ok) {
    console.error('❌ Failed to fetch edges');
    process.exit(1);
  }

  const edgesData = await edgesResponse.json();
  const edges = edgesData.result;

  console.log(`Found ${edges.length} VeloCloud edges in CMDB`);

  // Step 2: For each edge, find matching firewall by account number
  let created = 0;
  let skipped = 0;

  for (const edge of edges) {
    const accountNumber = edge.u_account_number;
    if (!accountNumber) {
      console.log(`⏭️  ${edge.name} - No account number`);
      skipped++;
      continue;
    }

    // Find firewall with matching account (simplified - needs manual mapping)
    console.log(`🔗 ${edge.name} (${accountNumber})`);
    console.log(`   TODO: Manual mapping needed - which firewall serves this edge?`);
    skipped++;
  }

  console.log('');
  console.log(`Created: ${created}, Skipped: ${skipped}`);
  console.log('');
  console.log('⚠️  MANUAL MAPPING REQUIRED');
  console.log('Edge-to-firewall relationships need business logic to determine correct pairings.');
}

createEdgeFirewallRelationships()
  .catch(console.error)
  .finally(() => process.exit(0));
