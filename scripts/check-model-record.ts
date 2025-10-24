/**
 * Check Model Record in cmdb_model Table
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkModelRecord() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Check if model 100F exists in cmdb_model table
  const modelSysId = '100F';

  console.log('Checking model record in cmdb_model table...');
  console.log(`Model sys_id: ${modelSysId}`);
  console.log('');

  const url = `${instanceUrl}/api/now/table/cmdb_model/${modelSysId}?sysparm_display_value=all`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Model record not found (${response.status})`);
    console.log('');
    console.log('This means the model "100F" does not exist in the cmdb_model table.');
    console.log('The model_id field IS set correctly on the firewall, but it references');
    console.log('a model record that doesn\'t exist, which is why it shows empty in the UI.');
    process.exit(1);
  }

  const data = await response.json();
  const model = data.result;

  console.log('✅ Model record found:');
  console.log('');
  console.log(`  sys_id: ${model.sys_id.display_value || model.sys_id}`);
  console.log(`  Name: ${model.name?.display_value || model.name || '(empty)'}`);
  console.log(`  Display Name: ${model.display_name?.display_value || model.display_name || '(empty)'}`);
  console.log(`  Model Number: ${model.model_number?.display_value || model.model_number || '(empty)'}`);
  console.log(`  Manufacturer: ${model.manufacturer?.display_value || '(empty)'}`);
  console.log('');
  console.log('Full record:', JSON.stringify(model, null, 2));
}

checkModelRecord()
  .catch(console.error)
  .finally(() => process.exit(0));
