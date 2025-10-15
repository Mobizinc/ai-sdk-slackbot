/**
 * Check Model and Ports Fields
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkFields() {
  const instanceUrl = process.env.DEV_SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD;
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const sysId = '2e721fd2836c3a1068537cdfeeaad301';
  const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${sysId}`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader },
  });

  const data = await response.json();
  const fw = data.result;

  console.log('Fields related to model and ports:');
  console.log('model_id:', fw.model_id);
  console.log('model_number:', fw.model_number);
  console.log('ports:', fw.ports);
  console.log('physical_interface_count:', fw.physical_interface_count);
}

checkFields().catch(console.error);
