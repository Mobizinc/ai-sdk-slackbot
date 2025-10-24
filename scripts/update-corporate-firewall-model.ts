/**
 * Update Corporate Office Firewall Model
 *
 * Populate the model_id field with "100F"
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function updateCorporateFirewallModel() {
  console.log('📝 Updating Corporate Office Firewall Model');
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

  const firewallSysId = '56328281c3226a10a01d5673e4013120';

  // Get current firewall details
  const getUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${firewallSysId}?sysparm_display_value=all`;

  const getResponse = await fetch(getUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!getResponse.ok) {
    console.error('❌ Failed to fetch firewall');
    process.exit(1);
  }

  const getData = await getResponse.json();
  const firewall = getData.result;

  console.log('Current firewall details:');
  console.log(`  Name: ${firewall.name.display_value}`);
  console.log(`  Manufacturer: ${firewall.manufacturer.display_value || '(empty)'}`);
  console.log(`  Model: ${firewall.model_id.display_value || '(empty)'}`);
  console.log('');

  // Update model_id
  const payload = {
    model_id: '100F',
  };

  console.log('Updating model_id to: 100F');
  console.log('');

  const updateUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${firewallSysId}`;

  const updateResponse = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.error(`❌ Failed to update: ${updateResponse.status} - ${errorText.substring(0, 300)}`);
    process.exit(1);
  }

  const updateData = await updateResponse.json();
  console.log('✅ Model updated successfully!');
  console.log('');
  console.log('─'.repeat(70));
  console.log('UPDATED DETAILS');
  console.log('─'.repeat(70));
  console.log(`Name: ${updateData.result.name}`);
  console.log(`Model: ${updateData.result.model_id}`);
  console.log('');
  console.log(`Link: ${instanceUrl}/cmdb_ci_netgear.do?sys_id=${firewallSysId}`);
}

updateCorporateFirewallModel()
  .catch(console.error)
  .finally(() => process.exit(0));
