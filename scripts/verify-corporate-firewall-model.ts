/**
 * Verify Corporate Office Firewall Model
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function verifyCorporateFirewallModel() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const firewallSysId = '56328281c3226a10a01d5673e4013120';

  const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${firewallSysId}?sysparm_fields=name,manufacturer,model_id&sysparm_display_value=all`;

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

  console.log('✅ Corporate Office Firewall Details:');
  console.log('');
  console.log(`  Name: ${firewall.name.display_value}`);
  console.log(`  Manufacturer: ${firewall.manufacturer.display_value}`);
  console.log(`  Model: ${firewall.model_id.display_value}`);
  console.log('');
  console.log(`  Link: ${instanceUrl}/cmdb_ci_netgear.do?sys_id=${firewallSysId}`);
}

verifyCorporateFirewallModel()
  .catch(console.error)
  .finally(() => process.exit(0));
