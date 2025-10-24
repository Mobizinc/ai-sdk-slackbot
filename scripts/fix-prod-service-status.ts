/**
 * Fix PROD Service Offering Status
 * Hardcoded to PROD to avoid UAT confusion
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function fixPROD() {
  console.log('🔧 Fixing PROD Service Offering Status');
  console.log('='.repeat(80));
  console.log(`Instance: ${instanceUrl}`);
  console.log('');

  const offeringNames = [
    'Infrastructure and Cloud Management',
    'Network Management',
    'Cybersecurity Management',
    'Helpdesk and Endpoint Support - 24/7',
    'Helpdesk and Endpoint - Standard',
    'Application Administration',
  ];

  let updated = 0;

  for (const name of offeringNames) {
    // Query
    const queryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=name=${encodeURIComponent(name)}&sysparm_fields=sys_id,name,service_status&sysparm_display_value=all&sysparm_limit=1`;

    const queryResp = await fetch(queryUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    const queryData = await queryResp.json();

    if (!queryData.result || queryData.result.length === 0) {
      console.log(`❌ "${name}" not found`);
      continue;
    }

    const offering = queryData.result[0];
    const sys_id = offering.sys_id?.value || offering.sys_id;
    const currentStatus = offering.service_status?.display_value || offering.service_status;

    console.log(`"${name}"`);
    console.log(`  Current: ${currentStatus}`);

    if (currentStatus === 'Operational') {
      console.log('  ✅ Already Operational');
      continue;
    }

    // Update
    const updateUrl = `${instanceUrl}/api/now/table/service_offering/${sys_id}`;
    const updateResp = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_status: 'operational' }),
    });

    if (!updateResp.ok) {
      console.log(`  ❌ Failed: ${updateResp.status}`);
      continue;
    }

    console.log('  ✅ Updated to Operational');
    updated++;
  }

  console.log('');
  console.log(`✅ Updated ${updated} Service Offerings to Operational`);
}

fixPROD();
