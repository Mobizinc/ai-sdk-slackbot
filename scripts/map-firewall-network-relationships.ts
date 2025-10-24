/**
 * Map Firewall-Network Relationships
 *
 * Query all Altus firewalls and networks, then match them by location
 * to prepare for creating CMDB relationships
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

interface FirewallCI {
  sys_id: string;
  name: string;
  location_sys_id: string;
  location_name: string;
}

interface NetworkCI {
  sys_id: string;
  name: string;
  location_sys_id: string;
  location_name: string;
  cidr: string;
}

interface RelationshipMapping {
  firewall_sys_id: string;
  firewall_name: string;
  network_sys_id: string;
  network_name: string;
  location_name: string;
}

async function mapFirewallNetworkRelationships() {
  console.log('🔗 Mapping Firewall-Network Relationships');
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

  // 1. Query all Altus firewalls
  console.log('1. Querying Altus firewalls');
  console.log('─'.repeat(70));

  const firewallQuery = encodeURIComponent('nameLIKEAltus');
  const firewallUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear?sysparm_query=${firewallQuery}&sysparm_display_value=all&sysparm_limit=100`;

  const firewallResponse = await fetch(firewallUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!firewallResponse.ok) {
    console.error(`❌ Failed to query firewalls: ${firewallResponse.status}`);
    process.exit(1);
  }

  const firewallData = await firewallResponse.json();
  const firewalls: FirewallCI[] = (firewallData.result || []).map((fw: any) => ({
    sys_id: fw.sys_id?.value || fw.sys_id,
    name: fw.name?.display_value || fw.name,
    location_sys_id: fw.location?.value || '',
    location_name: fw.location?.display_value || '(no location)',
  }));

  console.log(`Found ${firewalls.length} Altus firewalls`);
  console.log('');

  // 2. Query all Altus networks
  console.log('2. Querying Altus networks');
  console.log('─'.repeat(70));

  const networkQuery = encodeURIComponent('nameLIKEAltus');
  const networkUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=${networkQuery}&sysparm_display_value=all&sysparm_limit=100`;

  const networkResponse = await fetch(networkUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!networkResponse.ok) {
    console.error(`❌ Failed to query networks: ${networkResponse.status}`);
    process.exit(1);
  }

  const networkData = await networkResponse.json();
  const networks: NetworkCI[] = (networkData.result || []).map((nw: any) => {
    const ipAddress = nw.ip_address?.display_value || nw.ip_address || '';
    const subnet = nw.subnet?.display_value || nw.subnet || '';
    const cidr = subnet ? `${ipAddress}/${subnet}` : ipAddress;

    return {
      sys_id: nw.sys_id?.value || nw.sys_id,
      name: nw.name?.display_value || nw.name,
      location_sys_id: nw.location?.value || '',
      location_name: nw.location?.display_value || '(no location)',
      cidr,
    };
  });

  console.log(`Found ${networks.length} Altus networks`);
  console.log('');

  // 3. Match firewalls to networks by location
  console.log('3. Matching firewalls to networks by location');
  console.log('─'.repeat(70));
  console.log('');

  const relationships: RelationshipMapping[] = [];
  const locationMap = new Map<string, FirewallCI[]>();

  // Group firewalls by location
  for (const firewall of firewalls) {
    if (!firewall.location_sys_id) continue;

    if (!locationMap.has(firewall.location_sys_id)) {
      locationMap.set(firewall.location_sys_id, []);
    }
    locationMap.get(firewall.location_sys_id)!.push(firewall);
  }

  // Match each network to firewalls at the same location
  let matchedNetworks = 0;
  let unmatchedNetworks = 0;

  for (const network of networks) {
    if (!network.location_sys_id) {
      console.log(`⚠️  Network has no location: ${network.name}`);
      unmatchedNetworks++;
      continue;
    }

    const locationFirewalls = locationMap.get(network.location_sys_id);

    if (!locationFirewalls || locationFirewalls.length === 0) {
      console.log(`⚠️  No firewall found for location: ${network.location_name} (Network: ${network.name})`);
      unmatchedNetworks++;
      continue;
    }

    // Create relationships for each firewall at this location
    for (const firewall of locationFirewalls) {
      relationships.push({
        firewall_sys_id: firewall.sys_id,
        firewall_name: firewall.name,
        network_sys_id: network.sys_id,
        network_name: network.name,
        location_name: network.location_name,
      });

      console.log(`✅ ${network.location_name}`);
      console.log(`   Firewall: ${firewall.name}`);
      console.log(`   Network: ${network.name} (${network.cidr})`);
      console.log('');
    }

    matchedNetworks++;
  }

  // 4. Summary and export
  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Firewalls: ${firewalls.length}`);
  console.log(`Total Networks: ${networks.length}`);
  console.log(`  ✅ Matched: ${matchedNetworks}`);
  console.log(`  ⚠️  Unmatched: ${unmatchedNetworks}`);
  console.log(`Total Relationships to Create: ${relationships.length}`);
  console.log('');

  // Export mapping to CSV
  const outputDir = path.join(process.cwd(), 'backup', 'network-import');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'firewall-network-relationships.csv');
  const csvHeader = 'firewall_sys_id,firewall_name,network_sys_id,network_name,location_name\n';
  const csvRows = relationships.map(rel =>
    `${rel.firewall_sys_id},"${rel.firewall_name}",${rel.network_sys_id},"${rel.network_name}","${rel.location_name}"`
  ).join('\n');

  fs.writeFileSync(outputPath, csvHeader + csvRows);

  console.log(`✅ Relationship mapping exported to: ${outputPath}`);
  console.log('');

  if (unmatchedNetworks > 0) {
    console.log('⚠️  Some networks have no associated firewalls');
    console.log('   This is expected for locations without firewalls in the CMDB');
  }

  console.log('');
  console.log('Next Steps:');
  console.log('  1. Review the mapping CSV');
  console.log('  2. Create CMDB relationship records');
}

mapFirewallNetworkRelationships()
  .catch(console.error)
  .finally(() => process.exit(0));
