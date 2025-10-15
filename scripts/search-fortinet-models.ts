/**
 * Search for Fortinet Models in cmdb_model Table
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function searchFortinetModels() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('Searching for Fortinet models in cmdb_model table...');
  console.log('');

  // Search for models with Fortinet manufacturer
  const query = encodeURIComponent('nameLIKEFortinet^ORdisplay_nameLIKEFortinet^ORmodel_numberLIKE100');
  const url = `${instanceUrl}/api/now/table/cmdb_model?sysparm_query=${query}&sysparm_limit=20&sysparm_display_value=all`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Failed to search (${response.status})`);
    process.exit(1);
  }

  const data = await response.json();
  const models = data.result;

  console.log(`Found ${models.length} models`);
  console.log('');

  if (models.length === 0) {
    console.log('No Fortinet models found in cmdb_model table.');
    console.log('');
    console.log('This suggests that model_id might be a string field, not a reference,');
    console.log('OR the cmdb_model table is not populated for Altus equipment.');
  } else {
    for (const model of models) {
      console.log(`Model: ${model.sys_id?.display_value || model.sys_id}`);
      console.log(`  Name: ${model.name?.display_value || model.name || '(empty)'}`);
      console.log(`  Display Name: ${model.display_name?.display_value || model.display_name || '(empty)'}`);
      console.log(`  Model Number: ${model.model_number?.display_value || model.model_number || '(empty)'}`);
      console.log('');
    }
  }
}

searchFortinetModels()
  .catch(console.error)
  .finally(() => process.exit(0));
