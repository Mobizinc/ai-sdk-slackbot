/**
 * Verify Networks in PROD
 *
 * Confirm all 30 IP network CIs exist with complete data
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function verifyNetworksPROD() {
  console.log('✅ Verifying Networks in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Query all Altus networks
  const query = encodeURIComponent('nameLIKEAltus');
  const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=50`;

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
  const networks = data.result || [];

  console.log(`Found ${networks.length} Altus networks in PROD`);
  console.log('');
  console.log('─'.repeat(70));

  let complete = 0;
  let incomplete = 0;

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i];
    const name = network.name?.display_value || network.name;
    const ipAddress = network.ip_address?.display_value || network.ip_address;
    const subnet = network.subnet?.display_value || network.subnet;
    const location = network.location?.display_value || '(no location)';
    const dnsDomain = network.dns_domain?.display_value || network.dns_domain || '';
    const comments = network.comments?.display_value || network.comments || '';

    const cidr = subnet ? `${ipAddress}/${subnet}` : ipAddress;

    const hasLocation = network.location?.display_value || network.location?.value;
    const domainStr = typeof dnsDomain === 'string' ? dnsDomain : String(dnsDomain);
    const commentsStr = typeof comments === 'string' ? comments : String(comments);
    const hasDomain = domainStr && domainStr.trim() && domainStr !== 'null' && domainStr !== 'undefined';
    const hasComments = commentsStr && commentsStr.trim() && commentsStr !== 'null' && commentsStr !== 'undefined';

    const isComplete = hasLocation && (hasDomain || hasComments);

    console.log(`${i + 1}. ${name}`);
    console.log(`   CIDR: ${cidr}`);
    console.log(`   Location: ${location} ${hasLocation ? '✅' : '❌'}`);
    console.log(`   DNS Domain: ${dnsDomain || '(none)'} ${hasDomain ? '✅' : '⚪'}`);
    console.log(`   Comments: ${hasComments ? '✅' : '⚪'}`);
    console.log('');

    if (isComplete) {
      complete++;
    } else {
      incomplete++;
    }
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Networks: ${networks.length}`);
  console.log(`  ✅ Complete: ${complete}`);
  console.log(`  ⚠️  Incomplete: ${incomplete}`);
  console.log('');

  if (networks.length === 30 && complete === networks.length) {
    console.log('✅ SUCCESS! All 30 networks imported with complete data!');
  } else if (networks.length === 30) {
    console.log('✅ All 30 networks imported');
    console.log('⚠️  Some networks may need additional data');
  } else {
    console.log(`⚠️  Expected 30 networks, found ${networks.length}`);
  }

  console.log('');
}

verifyNetworksPROD()
  .catch(console.error)
  .finally(() => process.exit(0));
