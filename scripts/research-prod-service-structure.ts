/**
 * Research Current Service Structure in PROD
 * Check what Business Services, Service Offerings, and Application Services exist
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function researchProdServices() {
  console.log('🔍 Researching PROD Service Structure');
  console.log('='.repeat(70));
  console.log('');

  // Use PROD credentials explicitly
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = process.env.SERVICENOW_USERNAME || 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = process.env.SERVICENOW_PASSWORD || 'jOH2NgppZwdSY+I';

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('Step 1: Check Business Services');
  console.log('─'.repeat(70));

  // Query all Business Services
  const bsUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_business?sysparm_query=nameLIKEManaged^ORnameLIKEAltus&sysparm_limit=10&sysparm_display_value=all`;

  const bsResponse = await fetch(bsUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (bsResponse.ok) {
    const bsData = await bsResponse.json();
    console.log(`Found ${bsData.result.length} Business Service(s):`);

    if (bsData.result.length === 0) {
      console.log('  (none found)');
    } else {
      for (const bs of bsData.result) {
        const name = bs.name?.display_value || bs.name || '(no name)';
        const sysId = bs.sys_id?.value || bs.sys_id || '';
        console.log(`  - ${name}`);
        console.log(`    sys_id: ${sysId}`);
      }
    }
  } else {
    console.log(`  ❌ Failed to query: ${bsResponse.status}`);
  }

  console.log('');
  console.log('Step 2: Check Service Offerings');
  console.log('─'.repeat(70));

  // Query Service Offerings
  const soUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=nameLIKEApplication^ORnameLIKEInfrastructure^ORnameLIKENetwork^ORnameLIKECybersecurity^ORnameLIKEHelpdesk&sysparm_limit=20&sysparm_display_value=all`;

  const soResponse = await fetch(soUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (soResponse.ok) {
    const soData = await soResponse.json();
    console.log(`Found ${soData.result.length} Service Offering(s):`);

    if (soData.result.length === 0) {
      console.log('  (none found)');
    } else {
      for (const so of soData.result) {
        const name = so.name?.display_value || so.name || '(no name)';
        const sysId = so.sys_id?.value || so.sys_id || '';
        const parent = so.parent?.display_value || '(no parent)';
        console.log(`  - ${name}`);
        console.log(`    sys_id: ${sysId}`);
        console.log(`    parent: ${parent}`);
      }
    }
  } else {
    console.log(`  ❌ Failed to query: ${soResponse.status}`);
  }

  console.log('');
  console.log('Step 3: Check Altus Application Services');
  console.log('─'.repeat(70));

  // Query Application Services for Altus
  const asUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=nameLIKEAltus Health&sysparm_limit=30&sysparm_display_value=all`;

  const asResponse = await fetch(asUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (asResponse.ok) {
    const asData = await asResponse.json();
    console.log(`Found ${asData.result.length} Application Service(s) for Altus:`);

    if (asData.result.length === 0) {
      console.log('  (none found)');
    } else {
      for (const as of asData.result) {
        const name = as.name?.display_value || as.name || '(no name)';
        const sysId = as.sys_id?.value || as.sys_id || '';
        const parent = as.parent?.display_value || '(no parent)';
        console.log(`  - ${name}`);
        console.log(`    sys_id: ${sysId}`);
        console.log(`    parent: ${parent}`);
      }
    }
  } else {
    console.log(`  ❌ Failed to query: ${asResponse.status}`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log('');
  console.log('Next Steps:');
  console.log('  1. If Business Service missing: Create "Managed Support Services"');
  console.log('  2. If Service Offerings missing: Create 6 offerings under Business Service');
  console.log('  3. If Application Services missing: Create 24 services under offerings');
}

researchProdServices()
  .catch(console.error)
  .finally(() => process.exit(0));
