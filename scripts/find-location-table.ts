/**
 * Find Location Table in ServiceNow (READ-ONLY)
 *
 * Tries different common location table names to find which one works.
 *
 * Common location tables in ServiceNow:
 * - cmn_location (most common)
 * - cmdb_location
 * - sys_location
 * - core_location
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL: Production instance URL
 * - SERVICENOW_USERNAME: Production API username
 * - SERVICENOW_PASSWORD: Production API password
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function findLocationTable() {
  console.log('🔍 Finding Location Table in ServiceNow');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD ServiceNow credentials not configured');
    process.exit(1);
  }

  console.log(`Instance: ${instanceUrl}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const tablesToTry = [
    'cmn_location',
    'cmdb_location',
    'sys_location',
    'core_location',
    'location',
  ];

  for (const table of tablesToTry) {
    console.log(`Trying: ${table}...`);

    const url = `${instanceUrl}/api/now/table/${table}?sysparm_limit=5&sysparm_display_value=all`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const locations = data.result || [];

        console.log(`  ✅ SUCCESS! Found ${locations.length} location(s)`);
        console.log('');
        console.log('Sample locations:');
        console.log('');

        for (const loc of locations.slice(0, 5)) {
          const name = typeof loc.name === 'object' ? loc.name.display_value : loc.name;
          const sysId = typeof loc.sys_id === 'object' ? loc.sys_id.value : loc.sys_id;
          const city = typeof loc.city === 'object' ? loc.city.display_value : loc.city;
          const state = typeof loc.state === 'object' ? loc.state.display_value : loc.state;

          console.log(`  ${name}`);
          console.log(`    sys_id: ${sysId}`);
          console.log(`    City: ${city || 'N/A'}`);
          console.log(`    State: ${state || 'N/A'}`);
          console.log('');
        }

        console.log('─'.repeat(70));
        console.log(`✅ Correct table: ${table}`);
        console.log('─'.repeat(70));
        console.log('');
        console.log('Update extract-servicenow-reference-data.ts to use this table.');
        console.log('');

        return table;
      } else {
        console.log(`  ❌ Failed (${response.status})`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
  }

  console.log('');
  console.log('❌ Could not find location table');
  console.log('   The location table might have a custom name in this instance.');
}

findLocationTable()
  .catch(console.error)
  .finally(() => process.exit(0));
