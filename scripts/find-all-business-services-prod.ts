/**
 * Find ALL Business Services in PROD (no name filter)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function findAllBusinessServices() {
  console.log('🔍 Finding ALL Business Services in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Query ALL Business Services (no filter)
  const url = `${instanceUrl}/api/now/table/cmdb_ci_service_business?sysparm_limit=50&sysparm_display_value=all&sysparm_fields=sys_id,name,number,u_sn_app_service_id`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Failed to query: ${response.status}`);
    const errorText = await response.text();
    console.error(errorText);
    process.exit(1);
  }

  const data = await response.json();

  console.log(`Found ${data.result.length} Business Service(s) in PROD:`);
  console.log('');

  if (data.result.length === 0) {
    console.log('  ✅ No Business Services exist in PROD');
  } else {
    for (const bs of data.result) {
      const name = bs.name?.display_value || bs.name || '(no name)';
      const number = bs.number?.display_value || bs.number || '(no number)';
      const sysId = bs.sys_id?.value || bs.sys_id || '';
      const appServiceId = bs.u_sn_app_service_id?.display_value || bs.u_sn_app_service_id || '(none)';

      console.log(`  - Name: ${name}`);
      console.log(`    Number: ${number}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    SN App Service ID: ${appServiceId}`);
      console.log('');
    }
  }
}

findAllBusinessServices()
  .catch(console.error)
  .finally(() => process.exit(0));
