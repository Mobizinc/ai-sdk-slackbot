/**
 * Link HQ Network to Corporate Office Firewall
 *
 * HQ and Corporate Office are the same physical location,
 * so the Corporate Office firewall should protect both networks
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function linkHQNetworkToCorporateFirewall() {
  console.log('🔗 Linking HQ Network to Corporate Office Firewall');
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
  console.log('⚠️  WARNING: Creating relationship in PRODUCTION');
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Corporate Office firewall and HQ Network details
  const firewallSysId = '56328281c3226a10a01d5673e4013120'; // Altus - Corporate Office firewall
  const networkSysId = 'dbaa1bd2c3e4721066d9bdb4e401317e'; // Altus - HQ Network
  const relationshipType = '5599a965c0a8010e00da3b58b113d70e'; // Connects to::Connected by

  console.log('Creating relationship:');
  console.log(`  Firewall: Altus - Corporate Office (${firewallSysId})`);
  console.log(`  Network: Altus - HQ Network (${networkSysId})`);
  console.log(`  Location: Corporate Office / HQ (same physical location)`);
  console.log('');

  // Check if relationship already exists
  const checkQuery = encodeURIComponent(`parent=${firewallSysId}^child=${networkSysId}^type=${relationshipType}`);
  const checkUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${checkQuery}&sysparm_limit=1`;

  const checkResponse = await fetch(checkUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (checkResponse.ok) {
    const checkData = await checkResponse.json();
    if (checkData.result && checkData.result.length > 0) {
      console.log('ℹ️  Relationship already exists');
      console.log(`   sys_id: ${checkData.result[0].sys_id}`);
      console.log('');
      process.exit(0);
    }
  }

  // Create the relationship
  const payload = {
    parent: firewallSysId,
    child: networkSysId,
    type: relationshipType,
  };

  try {
    const url = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Failed: ${response.status} - ${errorText.substring(0, 300)}`);
      process.exit(1);
    }

    const responseData = await response.json();
    const sysId = responseData.result.sys_id;

    console.log('✅ Relationship created successfully!');
    console.log(`   sys_id: ${sysId}`);
    console.log('');
    console.log('─'.repeat(70));
    console.log('SUMMARY');
    console.log('─'.repeat(70));
    console.log('✅ HQ Network is now linked to Corporate Office firewall');
    console.log('');
    console.log('All 30 networks are now linked to their protecting firewalls!');
  } catch (error) {
    console.log(`❌ Error: ${error}`);
    process.exit(1);
  }
}

linkHQNetworkToCorporateFirewall()
  .catch(console.error)
  .finally(() => process.exit(0));
