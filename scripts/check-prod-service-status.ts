/**
 * Quick check PROD Service Offering status
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

async function check() {
  console.log('Checking PROD Service Offerings...');
  console.log(`Instance: ${instanceUrl}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const url = `${instanceUrl}/api/now/table/service_offering?sysparm_query=name=Application%20Administration&sysparm_fields=sys_id,name,service_status&sysparm_display_value=all&sysparm_limit=1`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const data = await response.json();
  console.log('Application Administration:');
  console.log(JSON.stringify(data.result[0], null, 2));
}

check();
