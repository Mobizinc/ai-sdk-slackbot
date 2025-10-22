/**
 * Inspect Service Offering Table Structure
 *
 * Retrieves one Service Offering with ALL fields to see what's available
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = process.env.UAT_SERVICENOW_URL || process.env.SERVICENOW_INSTANCE_URL;
const username = process.env.UAT_SERVICENOW_USERNAME || process.env.SERVICENOW_USERNAME;
const password = process.env.UAT_SERVICENOW_PASSWORD || process.env.SERVICENOW_PASSWORD;

if (!instanceUrl || !username || !password) {
  console.error('❌ ServiceNow credentials not configured');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function inspectFields() {
  console.log('🔍 Inspecting Service Offering Table Structure');
  console.log('='.repeat(80));
  console.log(`Instance: ${instanceUrl}`);
  console.log('');

  // Get one Service Offering with ALL fields
  const url = `${instanceUrl}/api/now/table/service_offering?sysparm_limit=1&sysparm_display_value=all`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Error: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();

  if (!data.result || data.result.length === 0) {
    console.log('❌ No Service Offerings found');
    process.exit(1);
  }

  const offering = data.result[0];

  console.log('Service Offering Record:');
  console.log(JSON.stringify(offering, null, 2));
  console.log('');

  console.log('─'.repeat(80));
  console.log('All Fields:');
  Object.keys(offering).forEach(key => {
    const value = offering[key];
    const display = typeof value === 'object' && value !== null
      ? `{value: "${value.value}", display: "${value.display_value}"}`
      : value;
    console.log(`  ${key}: ${display}`);
  });
}

inspectFields().catch(console.error);
