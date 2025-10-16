/**
 * Check Firewall Model Field Structure
 *
 * Look at Lumberton firewall to see how model_id is structured
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkFirewallModelStructure() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Check Lumberton firewall which should have model_id: 100D
  const lumbertonSysId = '43b34205c3226a10a01d5673e40131db';

  console.log('Checking Lumberton firewall (should have model)...');
  console.log('');

  const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${lumbertonSysId}?sysparm_display_value=all`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Failed to fetch firewall');
    process.exit(1);
  }

  const data = await response.json();
  const firewall = data.result;

  console.log('Lumberton Firewall:');
  console.log(`  Name: ${firewall.name.display_value}`);
  console.log(`  Manufacturer: ${firewall.manufacturer.display_value}`);
  console.log(`  Model ID (display): ${firewall.model_id.display_value || '(empty)'}`);
  console.log(`  Model ID (value): ${firewall.model_id.value || '(empty)'}`);
  console.log('');
  console.log('Full model_id object:', JSON.stringify(firewall.model_id, null, 2));
  console.log('');

  // Now check Corporate Office
  const corporateSysId = '56328281c3226a10a01d5673e4013120';

  console.log('─'.repeat(70));
  console.log('Checking Corporate Office firewall...');
  console.log('');

  const corpUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${corporateSysId}?sysparm_display_value=all`;

  const corpResponse = await fetch(corpUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!corpResponse.ok) {
    console.error('❌ Failed to fetch corporate firewall');
    process.exit(1);
  }

  const corpData = await corpResponse.json();
  const corpFirewall = corpData.result;

  console.log('Corporate Office Firewall:');
  console.log(`  Name: ${corpFirewall.name.display_value}`);
  console.log(`  Manufacturer: ${corpFirewall.manufacturer.display_value}`);
  console.log(`  Model ID (display): ${corpFirewall.model_id.display_value || '(empty)'}`);
  console.log(`  Model ID (value): ${corpFirewall.model_id.value || '(empty)'}`);
  console.log('');
  console.log('Full model_id object:', JSON.stringify(corpFirewall.model_id, null, 2));
}

checkFirewallModelStructure()
  .catch(console.error)
  .finally(() => process.exit(0));
