/**
 * Find Dallas Location
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function findDallasLocation() {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const searchTerms = ['Dallas', 'Datacenter', 'Data Center', 'DC', 'EER'];

  for (const term of searchTerms) {
    const query = encodeURIComponent(`nameLIKE${term}`);
    const url = `${instanceUrl}/api/now/table/cmn_location?sysparm_query=${query}&sysparm_limit=10`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        console.log(`\nResults for "${term}":`);
        for (const loc of data.result) {
          console.log(`  ${loc.name}: ${loc.sys_id}`);
        }
      }
    }
  }
}

findDallasLocation().catch(console.error);
