/**
 * Quick Check: UAT Open Cases
 *
 * Queries UAT ServiceNow for any open cases to test classification against.
 */

import { Buffer } from 'node:buffer';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const instanceUrl = process.env.UAT_SERVICENOW_URL;
const username = process.env.UAT_SERVICENOW_USERNAME;
const password = process.env.UAT_SERVICENOW_PASSWORD;
const caseTable = process.env.UAT_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

if (!instanceUrl || !username || !password) {
  console.error('❌ UAT credentials not configured in .env.local');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const query = `state!=Closed^state!=Resolved^ORDERBYDESCopened_at`;
const url = `${instanceUrl}/api/now/table/${caseTable}?sysparm_query=${encodeURIComponent(query)}&sysparm_limit=10&sysparm_display_value=all&sysparm_fields=sys_id,number,short_description,description,company,category,state,opened_at`;

console.log('🔍 Checking UAT for open cases...');
console.log(`   Instance: ${instanceUrl}`);
console.log('');

async function checkOpenCases() {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ServiceNow request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.result || data.result.length === 0) {
      console.log('❌ No open cases found in UAT');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Create a test case in UAT ServiceNow');
      console.log('  2. Or run automated script: npx tsx scripts/create-and-test-uat-case.ts');
      console.log('');
      process.exit(1);
    }

    console.log(`✅ Found ${data.result.length} open case(s) in UAT:`);
    console.log('');

    data.result.forEach((c: any, idx: number) => {
      const extractValue = (field: any): string => {
        if (!field) return '';
        if (typeof field === 'string') return field;
        if (typeof field === 'object' && field.display_value) return field.display_value;
        if (typeof field === 'object' && field.value) return field.value;
        return String(field);
      };

      const caseNumber = extractValue(c.number);
      const shortDesc = extractValue(c.short_description);
      const description = extractValue(c.description);
      const company = extractValue(c.company);
      const state = extractValue(c.state);
      const sys_id = extractValue(c.sys_id);

      console.log(`${idx + 1}. ${caseNumber} (sys_id: ${sys_id})`);
      console.log(`   Company: ${company}`);
      console.log(`   State: ${state}`);
      console.log(`   Short Description: ${shortDesc}`);

      if (description && description.length > 0) {
        console.log(`   Description: ${description.substring(0, 150)}${description.length > 150 ? '...' : ''}`);
      }
      console.log('');
    });

    console.log('─'.repeat(80));
    console.log('To test classification on one of these cases:');
    console.log('  npx tsx scripts/test-uat-case-classification.ts');
    console.log('');
    console.log('The test will use the first case listed above.');
    console.log('');

  } catch (error) {
    console.error('❌ Error querying UAT:', error);
    process.exit(1);
  }
}

checkOpenCases();
