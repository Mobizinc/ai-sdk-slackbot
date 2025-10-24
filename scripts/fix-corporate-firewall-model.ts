/**
 * Fix Corporate Office Firewall Model Reference
 *
 * Update model_id to point to the correct cmdb_model record
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function fixCorporateFirewallModel() {
  console.log('🔧 Fixing Corporate Office Firewall Model Reference');
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
  const modelSysId = '386db186c3c06658a01d5673e401317b'; // FortiGate-100F model

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
  console.log(`  Manufacturer: ${firewall.manufacturer.display_value}`);
  console.log(`  Model (current): ${firewall.model_id.display_value || '(empty)'}`);
  console.log(`  Model sys_id (current): ${firewall.model_id.value || '(empty)'}`);
  console.log('');

  // Update model_id to point to the correct model record
  const payload = {
    model_id: modelSysId, // sys_id of FortiGate-100F model
  };

  console.log('Updating model_id to: 386db186c3c06658a01d5673e401317b (FortiGate-100F)');
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

  console.log('✅ Model updated successfully!');
  console.log('');

  // Verify the update
  const verifyUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${firewallSysId}?sysparm_display_value=all`;

  const verifyResponse = await fetch(verifyUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (verifyResponse.ok) {
    const verifyData = await verifyResponse.json();
    const updatedFirewall = verifyData.result;

    console.log('─'.repeat(70));
    console.log('UPDATED FIREWALL DETAILS');
    console.log('─'.repeat(70));
    console.log(`Name: ${updatedFirewall.name.display_value}`);
    console.log(`Manufacturer: ${updatedFirewall.manufacturer.display_value}`);
    console.log(`Model: ${updatedFirewall.model_id.display_value || '(empty)'}`);
    console.log(`Model sys_id: ${updatedFirewall.model_id.value}`);
    console.log('');
    console.log(`Link: ${instanceUrl}/cmdb_ci_netgear.do?sys_id=${firewallSysId}`);
  }
}

fixCorporateFirewallModel()
  .catch(console.error)
  .finally(() => process.exit(0));
