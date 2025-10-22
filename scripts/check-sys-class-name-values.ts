/**
 * Check Actual sys_class_name Values
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkSysClassName() {
  console.log('🔍 Checking sys_class_name Actual Values');
  console.log('='.repeat(80));
  console.log('');

  // Fetch WITHOUT display_value to see raw values
  const url = `${instanceUrl}/api/now/table/service_offering?sysparm_query=name=Application%20Administration&sysparm_fields=sys_id,name,sys_class_name&sysparm_limit=1`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const data = await response.json();

  if (data.result && data.result.length > 0) {
    const so = data.result[0];

    console.log('Raw Field Values (no display_value):');
    console.log(JSON.stringify(so, null, 2));
    console.log('');

    console.log('sys_class_name value:', so.sys_class_name);
  }

  // Now check what the task.service_offering field actually references
  console.log('─'.repeat(80));
  console.log('Checking what table the service_offering field references:');
  console.log('');

  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=task^element=service_offering&sysparm_fields=reference,ref_qual`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (dictData.result && dictData.result.length > 0) {
    console.log('task.service_offering field configuration:');
    console.log(JSON.stringify(dictData.result[0], null, 2));
  }
}

checkSysClassName().catch(console.error);
