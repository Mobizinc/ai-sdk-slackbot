/**
 * Verify Firewall Locations in PROD
 *
 * Check which firewalls exist and their current location assignments
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function verifyFirewallLocationsProd() {
  console.log('🔍 Verifying Firewall Locations in PROD');
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

  // Firewalls we need to check
  const checkFirewalls = [
    'Amarillo S',
    'Amarillo W',
    'Amarillo N',
    'Livingston',
    'Riversid',
    'Corporate',
    'Dallas',
  ];

  console.log('Searching for key firewalls:');
  console.log('─'.repeat(70));

  for (const searchTerm of checkFirewalls) {
    const query = encodeURIComponent(`nameLIKE${searchTerm}`);
    const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=5`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        for (const fw of data.result) {
          const name = fw.name?.display_value || fw.name;
          const sysId = fw.sys_id?.value || fw.sys_id;
          const location = fw.location?.display_value || '(no location)';
          const locationSysId = fw.location?.value || '';

          console.log(`\n✅ Found: ${name}`);
          console.log(`   sys_id: ${sysId}`);
          console.log(`   Location: ${location}`);
          console.log(`   Location sys_id: ${locationSysId}`);
        }
      } else {
        console.log(`\n❌ NOT FOUND: ${searchTerm}`);
      }
    } else {
      console.log(`\n❌ Query failed for: ${searchTerm} (${response.status})`);
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('✅ Verification complete');
}

verifyFirewallLocationsProd()
  .catch(console.error)
  .finally(() => process.exit(0));
