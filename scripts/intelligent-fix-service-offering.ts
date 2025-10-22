/**
 * Intelligent Fix for Service Offering Lookup
 *
 * Updates the reference qualifier on task.service_offering field
 * to show all 6 Service Offerings under "Managed Support Services"
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function intelligentFix() {
  console.log('🔧 INTELLIGENT SERVICE OFFERING FIX');
  console.log('='.repeat(100));
  console.log('');
  console.log('Applying Option A: Static filter to show all 6 offerings');
  console.log('');

  // Step 1: Get the dictionary entry
  console.log('Step 1: Locating dictionary entry...');
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=task^element=service_offering&sysparm_fields=sys_id,name,element,reference,ref_qual&sysparm_limit=1`;

  const dictResp = await fetch(dictUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
  });

  if (!dictResp.ok) {
    console.error(`❌ Failed to fetch dictionary entry: ${dictResp.status}`);
    console.error(await dictResp.text());
    return;
  }

  const dictData = await dictResp.json();

  if (!dictData.result || dictData.result.length === 0) {
    console.error('❌ Dictionary entry not found');
    return;
  }

  const dictEntry = dictData.result[0];
  const sysId = dictEntry.sys_id;
  const currentRefQual = dictEntry.ref_qual || '(empty)';

  console.log('✅ Found dictionary entry:');
  console.log(`   sys_id: ${sysId}`);
  console.log(`   table: ${dictEntry.name}`);
  console.log(`   field: ${dictEntry.element}`);
  console.log(`   Current ref_qual: ${currentRefQual}`);
  console.log('');

  // Step 2: Update the reference qualifier
  console.log('Step 2: Updating reference qualifier...');

  const newRefQual = "javascript:'parent.name=Managed Support Services'";

  console.log(`   New value: ${newRefQual}`);
  console.log('');

  const updateUrl = `${instanceUrl}/api/now/table/sys_dictionary/${sysId}`;

  const updatePayload = {
    ref_qual: newRefQual
  };

  console.log('   Sending PATCH request...');
  const updateResp = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(updatePayload)
  });

  if (!updateResp.ok) {
    console.error(`❌ Failed to update: ${updateResp.status}`);
    const errorText = await updateResp.text();
    console.error(errorText);
    return;
  }

  const updateData = await updateResp.json();
  console.log('✅ PATCH request successful');
  console.log('');

  // Step 3: Verify the update
  console.log('Step 3: Verifying update persisted...');

  // Wait a moment for the update to propagate
  await new Promise(resolve => setTimeout(resolve, 2000));

  const verifyResp = await fetch(dictUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
  });

  const verifyData = await verifyResp.json();

  if (verifyData.result && verifyData.result.length > 0) {
    const updatedEntry = verifyData.result[0];
    const updatedRefQual = updatedEntry.ref_qual;

    console.log(`   Updated ref_qual: ${updatedRefQual || '(empty)'}`);

    if (updatedRefQual && updatedRefQual.includes('Managed Support Services')) {
      console.log('✅ SUCCESS: Reference qualifier updated and verified!');
    } else {
      console.log('⚠️  WARNING: Update may not have persisted correctly');
      console.log(`   Expected: ${newRefQual}`);
      console.log(`   Got: ${updatedRefQual || '(empty)'}`);
    }
  }

  console.log('');

  // Step 4: Test the filter
  console.log('Step 4: Testing the new filter...');
  const testUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=parent.name=Managed Support Services&sysparm_fields=sys_id,name&sysparm_limit=20`;

  const testResp = await fetch(testUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
  });

  const testData = await testResp.json();

  if (testData.result && testData.result.length > 0) {
    console.log(`✅ Filter returns ${testData.result.length} Service Offerings:`);
    testData.result.forEach((so: any, i: number) => {
      console.log(`   ${i + 1}. ${so.name}`);
    });
  } else {
    console.log('❌ Filter returns no results');
  }

  console.log('');
  console.log('='.repeat(100));
  console.log('✅ FIX COMPLETE');
  console.log('');
  console.log('Next Steps:');
  console.log('1. Log into ServiceNow: https://mobiz.service-now.com');
  console.log('2. Open incident INC0167770');
  console.log('3. Click the Service Offering field');
  console.log('4. You should now see all 6 offerings');
  console.log('');
  console.log('Note: You may need to clear browser cache or refresh the form');
  console.log('');
}

intelligentFix().catch(console.error);
