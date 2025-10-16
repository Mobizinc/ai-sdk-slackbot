/**
 * Check if NEW firewall serial numbers exist in PROD
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkSerialMatch() {
  console.log('🔍 Checking Serial Number Matches in PROD');
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

  // Serial numbers from the 12 "NEW" firewalls
  const newFirewalls = [
    { name: 'Altus - Pearland', serial: 'FGT60FTK23050889' },
    { name: 'Altus - Baytown', serial: 'FGT60FTK23051089' },
    { name: 'Altus - Crosby', serial: 'FGT60FTK23051418' },
    { name: 'Altus - Kingwood', serial: 'FGT60FTK23055496' },
    { name: 'Altus - Pasadena', serial: 'FGT60FTK23054832' },
  ];

  for (const fw of newFirewalls) {
    console.log(`Checking: ${fw.name}`);
    console.log(`  Serial: ${fw.serial}`);

    // Query by serial number
    const query = encodeURIComponent(`serial_number=${fw.serial}`);
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
        const existing = data.result[0];
        console.log(`  ✅ FOUND in PROD:`);
        console.log(`     Name in PROD: ${existing.name?.display_value || existing.name}`);
        console.log(`     sys_id: ${existing.sys_id?.value || existing.sys_id}`);
      } else {
        console.log(`  ❌ NOT FOUND in PROD`);
      }
    } else {
      console.log(`  ❌ Query failed: ${response.status}`);
    }
    console.log('');
  }
}

checkSerialMatch()
  .catch(console.error)
  .finally(() => process.exit(0));
