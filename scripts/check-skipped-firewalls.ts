/**
 * Check Skipped Firewalls in PROD
 *
 * Verifies the current state of the 12 skipped firewalls
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkSkippedFirewalls() {
  console.log('🔍 Checking Skipped Firewalls in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const skippedFirewalls = [
    'Altus - Pearland',
    'Altus - Baytown',
    'Altus - Crosby',
    'Altus - Kingwood',
    'Altus - Pasadena',
    'Altus - Porter',
    'Altus - Anderson Mill',
    'Altus - Arboretum',
    'Altus - Mueller',
    'Altus - Pflugerville',
    'Altus - Riversid',
    'Altus - South Lamar',
  ];

  console.log('Checking status of 12 skipped firewalls...');
  console.log('');

  const results = [];

  for (const name of skippedFirewalls) {
    const query = encodeURIComponent(`name=${name}`);
    const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=1`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        const fw = data.result[0];

        const hasFirmware = fw.firmware_version?.display_value || fw.firmware_version?.value;
        const hasComments = fw.comments?.display_value || fw.comments?.value;
        const hasInterfaceCount = fw.physical_interface_count?.display_value || fw.physical_interface_count?.value;
        const hasWarranty = fw.warranty_expiration?.display_value || fw.warranty_expiration?.value;

        results.push({
          name,
          sys_id: fw.sys_id?.value || fw.sys_id,
          firmware: hasFirmware ? '✅' : '❌',
          comments: hasComments ? '✅' : '❌',
          interface_count: hasInterfaceCount ? '✅' : '❌',
          warranty: hasWarranty ? '✅' : '❌',
        });
      }
    }
  }

  console.log('─'.repeat(70));
  console.log('FIREWALL STATUS IN PROD:');
  console.log('─'.repeat(70));
  console.log('');

  for (const result of results) {
    console.log(`${result.name}`);
    console.log(`  sys_id: ${result.sys_id}`);
    console.log(`  Firmware: ${result.firmware}  Comments: ${result.comments}  Interface Count: ${result.interface_count}  Warranty: ${result.warranty}`);
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY:');
  console.log('─'.repeat(70));
  console.log('');
  console.log('These firewalls need to be updated in PROD with:');
  console.log('  - Firmware versions');
  console.log('  - Management URLs in comments');
  console.log('  - Physical interface counts');
  console.log('  - License expiration dates');
  console.log('  - Support group assignment');
  console.log('');
}

checkSkippedFirewalls()
  .catch(console.error)
  .finally(() => process.exit(0));
