/**
 * Check Livingston Firewall Details in PROD
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkLivingstonDetails() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const livingstonSysId = 'b637424dc3226a10a01d5673e4013144';
  const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${livingstonSysId}?sysparm_display_value=all`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Failed to fetch Livingston firewall');
    process.exit(1);
  }

  const data = await response.json();
  const firewall = data.result;

  console.log('Livingston Firewall Details:');
  console.log('');
  console.log(`  Name: ${firewall.name?.display_value || '(empty)'}`);
  console.log(`  Manufacturer: ${firewall.manufacturer?.display_value || '(empty)'}`);
  console.log(`  Model: ${firewall.model_id?.display_value || '(empty)'}`);
  console.log(`  Model Value: ${firewall.model_id?.value || '(empty)'}`);
  console.log(`  Serial: ${firewall.serial_number?.display_value || '(empty)'}`);
  console.log(`  IP: ${firewall.ip_address?.display_value || '(empty)'}`);
  console.log(`  Comments: ${firewall.comments?.display_value || '(empty)'}`);
  console.log(`  Short Description: ${firewall.short_description?.display_value || '(empty)'}`);
  console.log('');

  console.log('Full record:');
  console.log(JSON.stringify(firewall, null, 2));
}

checkLivingstonDetails()
  .catch(console.error)
  .finally(() => process.exit(0));
