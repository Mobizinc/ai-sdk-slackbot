/**
 * Verify All Network-Firewall Links in PROD
 *
 * Confirms that all 30 networks have firewall relationships
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function verifyAllNetworkFirewallLinks() {
  console.log('🔍 Verifying All Network-Firewall Links in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  console.log(`URL: ${instanceUrl}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Get all Altus networks
  const networksQuery = encodeURIComponent('nameLIKEAltus^ORDERBYname');
  const networksUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=${networksQuery}&sysparm_fields=name,sys_id,ip_network,location&sysparm_display_value=true&sysparm_limit=50`;

  const networksResponse = await fetch(networksUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!networksResponse.ok) {
    console.error('❌ Failed to fetch networks');
    process.exit(1);
  }

  const networksData = await networksResponse.json();
  const networks = networksData.result;

  console.log(`Found ${networks.length} Altus networks`);
  console.log('');

  // For each network, check if it has a firewall relationship
  const relationshipType = '5599a965c0a8010e00da3b58b113d70e'; // Connects to::Connected by

  const results = [];
  let linkedCount = 0;
  let unlinkedCount = 0;

  for (const network of networks) {
    const networkSysId = network.sys_id;

    // Query for relationships where this network is the child (protected by firewall)
    const relQuery = encodeURIComponent(`child=${networkSysId}^type=${relationshipType}`);
    const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${relQuery}&sysparm_fields=parent,parent.name,child,child.name&sysparm_display_value=true&sysparm_limit=5`;

    const relResponse = await fetch(relUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (relResponse.ok) {
      const relData = await relResponse.json();
      const relationships = relData.result;

      if (relationships.length > 0) {
        linkedCount++;
        const firewall = relationships[0].parent.display_value;
        results.push({
          network: network.name,
          location: network.location.display_value || '(no location)',
          firewall: firewall,
          status: '✅',
        });
      } else {
        unlinkedCount++;
        results.push({
          network: network.name,
          location: network.location.display_value || '(no location)',
          firewall: 'NONE',
          status: '❌',
        });
      }
    } else {
      unlinkedCount++;
      results.push({
        network: network.name,
        location: network.location.display_value || '(no location)',
        firewall: 'ERROR',
        status: '❌',
      });
    }
  }

  // Display results
  console.log('─'.repeat(70));
  console.log('NETWORK-FIREWALL LINKAGE REPORT');
  console.log('─'.repeat(70));
  console.log('');

  // Group by status
  const linked = results.filter(r => r.status === '✅');
  const unlinked = results.filter(r => r.status === '❌');

  console.log(`✅ Linked Networks: ${linkedCount}/${networks.length}`);
  console.log('');

  for (const item of linked) {
    console.log(`  ${item.status} ${item.network}`);
    console.log(`     Location: ${item.location}`);
    console.log(`     Firewall: ${item.firewall}`);
    console.log('');
  }

  if (unlinked.length > 0) {
    console.log('─'.repeat(70));
    console.log(`❌ Unlinked Networks: ${unlinkedCount}/${networks.length}`);
    console.log('');

    for (const item of unlinked) {
      console.log(`  ${item.status} ${item.network}`);
      console.log(`     Location: ${item.location}`);
      console.log(`     Firewall: ${item.firewall}`);
      console.log('');
    }
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Networks: ${networks.length}`);
  console.log(`Linked: ${linkedCount} (${Math.round(linkedCount / networks.length * 100)}%)`);
  console.log(`Unlinked: ${unlinkedCount} (${Math.round(unlinkedCount / networks.length * 100)}%)`);
  console.log('');

  if (unlinkedCount === 0) {
    console.log('🎉 SUCCESS! All networks are linked to firewalls!');
  } else {
    console.log('⚠️  WARNING: Some networks are not linked to firewalls');
  }
}

verifyAllNetworkFirewallLinks()
  .catch(console.error)
  .finally(() => process.exit(0));
