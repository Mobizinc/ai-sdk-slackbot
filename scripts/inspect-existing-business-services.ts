/**
 * Inspect ALL fields of existing Business Services
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function inspectExistingBusinessServices() {
  console.log('🔍 Inspecting Existing Business Services in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Query the 2 existing Business Services
  const url = `${instanceUrl}/api/now/table/cmdb_ci_service_business?sysparm_limit=10`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Failed: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();

  console.log(`Found ${data.result.length} Business Service(s)`);
  console.log('');

  for (let i = 0; i < data.result.length; i++) {
    const bs = data.result[i];
    console.log(`═`.repeat(70));
    console.log(`Business Service #${i + 1}`);
    console.log(`═`.repeat(70));
    console.log('');

    // Print ALL fields
    const keys = Object.keys(bs).sort();
    for (const key of keys) {
      const value = bs[key];
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
      console.log(`  ${key}: ${valueStr}`);
    }
    console.log('');
  }
}

inspectExistingBusinessServices()
  .catch(console.error)
  .finally(() => process.exit(0));
