/**
 * Check Existing Model Record (100D)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkExistingModel() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Check model 100D which exists
  const modelSysId = '100D';

  console.log('Checking existing model 100D...');
  console.log('');

  const url = `${instanceUrl}/api/now/table/cmdb_model/${modelSysId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Model not found (${response.status})`);
    process.exit(1);
  }

  const data = await response.json();
  const model = data.result;

  console.log('Model 100D structure:');
  console.log(JSON.stringify(model, null, 2));
}

checkExistingModel()
  .catch(console.error)
  .finally(() => process.exit(0));
