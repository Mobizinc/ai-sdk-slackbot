/**
 * Lookup Missing Locations
 *
 * Find sys_ids for locations that weren't found
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function lookupMissingLocations() {
  console.log('🔍 Looking up Missing Locations');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const missingLocations = [
    'Dallas Datacenter',
    'Amarillo N',
    'Amarillo S',
    'Amarillo W',
    'AMA North', // Alternative name for Amarillo locations
  ];

  for (const locationName of missingLocations) {
    const query = encodeURIComponent(`nameLIKE${locationName}`);
    const url = `${instanceUrl}/api/now/table/cmn_location?sysparm_query=${query}&sysparm_limit=5`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        console.log(`Searching for: "${locationName}"`);
        for (const loc of data.result) {
          console.log(`  ✅ ${loc.name}: ${loc.sys_id}`);
        }
        console.log('');
      } else {
        console.log(`❌ No results for: "${locationName}"`);
        console.log('');
      }
    }
  }

  console.log('─'.repeat(70));
  console.log('Checking if Amarillo locations use "AMA North" as a common location');
  console.log('─'.repeat(70));
  console.log('');

  const amaQuery = encodeURIComponent('nameLIKEAMA');
  const amaUrl = `${instanceUrl}/api/now/table/cmn_location?sysparm_query=${amaQuery}&sysparm_limit=10`;

  const amaResponse = await fetch(amaUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (amaResponse.ok) {
    const amaData = await amaResponse.json();
    if (amaData.result && amaData.result.length > 0) {
      console.log('Found AMA locations:');
      for (const loc of amaData.result) {
        console.log(`  ${loc.name}: ${loc.sys_id}`);
      }
    }
  }

  console.log('');
}

lookupMissingLocations()
  .catch(console.error)
  .finally(() => process.exit(0));
