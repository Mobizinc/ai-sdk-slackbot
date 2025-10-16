/**
 * Search Specifically for FortiGate Models
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function searchFortiGateModels() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('🔍 Searching for FortiGate models...');
  console.log('');

  // Search for models with FortiGate in the name
  const query = encodeURIComponent('display_nameLIKEFortiGate');
  const url = `${instanceUrl}/api/now/table/cmdb_model?sysparm_query=${query}&sysparm_limit=100`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  const models = data.result;

  console.log(`Found ${models.length} FortiGate models`);
  console.log('');

  for (const model of models) {
    const displayName = model.display_name || '';
    const sysId = model.sys_id || '';

    // Extract model number
    const match = displayName.match(/FortiGate[- ]?(\w+)/i);
    if (match && match[1]) {
      const modelNumber = match[1];
      console.log(`  ${modelNumber}: ${sysId} (${displayName})`);
    }
  }

  console.log('');
  console.log('Needed models:');
  console.log('  - FortiGate 60F (currently using FortiSwitch-60F)');
  console.log('  - FortiGate 60D (currently using FortiSwitch-60D)');
  console.log('  - FortiGate 100D (currently using FortiSwitch-100D)');
  console.log('  - FortiGate 100F (✅ exists)');
}

searchFortiGateModels()
  .catch(console.error)
  .finally(() => process.exit(0));
