/**
 * Verify Firewall-Network Relationships
 *
 * Query and verify CMDB relationships between firewalls and networks
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function verifyFirewallNetworkRelationships() {
  console.log('✅ Verifying Firewall-Network Relationships');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.DEV_SERVICENOW_URL || process.env.SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME || process.env.SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD || process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const environment = process.env.DEV_SERVICENOW_URL ? 'DEV' : 'PRODUCTION';
  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Relationship type: "Connects to::Connected by"
  const relationshipType = '5599a965c0a8010e00da3b58b113d70e';

  // Query all firewall-network relationships
  console.log('Querying firewall-network relationships');
  console.log('─'.repeat(70));

  // Get all relationships where parent is a network gear (firewall) and child is a network
  const query = encodeURIComponent(`type=${relationshipType}`);
  const url = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=50`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Query failed: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();
  const allRelationships = data.result || [];

  // Filter to only Altus firewall-network relationships
  const altusRelationships = allRelationships.filter((rel: any) => {
    const parentName = rel.parent?.display_value || '';
    const childName = rel.child?.display_value || '';
    return parentName.includes('Altus') && childName.includes('Altus') && childName.includes('Network');
  });

  console.log(`Found ${altusRelationships.length} Altus firewall→network relationships`);
  console.log('');
  console.log('─'.repeat(70));

  if (altusRelationships.length === 0) {
    console.log('⚠️  No Altus firewall-network relationships found');
    console.log('');
    return;
  }

  // Group by location
  const byLocation = new Map<string, any[]>();

  for (const rel of altusRelationships) {
    const parentName = rel.parent?.display_value || 'Unknown';
    const childName = rel.child?.display_value || 'Unknown';
    const sysId = rel.sys_id?.value || rel.sys_id;

    // Extract location from parent name (firewall)
    const locationMatch = parentName.match(/Altus - (.+)/);
    const location = locationMatch ? locationMatch[1] : 'Unknown';

    if (!byLocation.has(location)) {
      byLocation.set(location, []);
    }

    byLocation.get(location)!.push({
      sys_id: sysId,
      firewall: parentName,
      network: childName,
    });
  }

  // Display grouped relationships
  const sortedLocations = Array.from(byLocation.keys()).sort();

  for (const location of sortedLocations) {
    const rels = byLocation.get(location)!;

    console.log(`📍 ${location}`);
    for (const rel of rels) {
      console.log(`   Firewall: ${rel.firewall}`);
      console.log(`   Network: ${rel.network}`);
      console.log(`   Relationship sys_id: ${rel.sys_id}`);
      console.log('');
    }
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Locations with Relationships: ${byLocation.size}`);
  console.log(`Total Firewall→Network Relationships: ${altusRelationships.length}`);
  console.log('');

  if (altusRelationships.length >= 11) {
    console.log('✅ SUCCESS! All expected relationships verified!');
  } else {
    console.log(`⚠️  Expected at least 11 relationships, found ${altusRelationships.length}`);
  }

  console.log('');
}

verifyFirewallNetworkRelationships()
  .catch(console.error)
  .finally(() => process.exit(0));
