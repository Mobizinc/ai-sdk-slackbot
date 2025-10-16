/**
 * Find Mobiz company record in PROD
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function findMobizCompany() {
  console.log('🔍 Finding Mobiz company record in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Search for Mobiz in company table
  const url = `${instanceUrl}/api/now/table/core_company?sysparm_query=nameLIKEmobiz&sysparm_display_value=all&sysparm_fields=sys_id,name`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Failed: ${response.status}`);
    const errorText = await response.text();
    console.error(errorText);
    process.exit(1);
  }

  const data = await response.json();

  console.log(`Found ${data.result.length} company record(s) matching "mobiz":`);
  console.log('');

  if (data.result.length === 0) {
    console.log('  ❌ No Mobiz company found');
  } else {
    for (const company of data.result) {
      const name = company.name?.display_value || company.name || '(no name)';
      const sysId = company.sys_id?.value || company.sys_id || '';
      console.log(`  - Name: ${name}`);
      console.log(`    sys_id: ${sysId}`);
      console.log('');
    }
  }
}

findMobizCompany()
  .catch(console.error)
  .finally(() => process.exit(0));
