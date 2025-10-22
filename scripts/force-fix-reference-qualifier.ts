/**
 * Force Fix Reference Qualifier Using PUT
 *
 * Uses PUT method with full record update instead of PATCH
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function forceFix() {
  console.log('🔨 FORCE FIX: Reference Qualifier Using PUT');
  console.log('='.repeat(100));
  console.log('');

  // Step 1: Get full dictionary entry
  console.log('Step 1: Fetching full dictionary entry...');
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=task^element=service_offering&sysparm_limit=1`;

  const dictResp = await fetch(dictUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
  });

  const dictData = await dictResp.json();

  if (!dictData.result || dictData.result.length === 0) {
    console.error('❌ Dictionary entry not found');
    return;
  }

  const dictEntry = dictData.result[0];
  const sysId = dictEntry.sys_id;

  console.log('✅ Found entry:');
  console.log(`   sys_id: ${sysId}`);
  console.log(`   Current ref_qual: ${dictEntry.ref_qual || '(empty)'}`);
  console.log('');
  console.log('Full entry:');
  console.log(JSON.stringify(dictEntry, null, 2));
  console.log('');

  // Step 2: Try PUT request
  console.log('Step 2: Attempting PUT request with ref_qual...');

  const newRefQual = "javascript:'parent.name=Managed Support Services'";

  // Build full payload with existing values
  const putPayload = {
    ...dictEntry,
    ref_qual: newRefQual
  };

  const updateUrl = `${instanceUrl}/api/now/table/sys_dictionary/${sysId}`;

  console.log(`   Target URL: ${updateUrl}`);
  console.log(`   Method: PUT`);
  console.log(`   New ref_qual: ${newRefQual}`);
  console.log('');

  const putResp = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(putPayload)
  });

  console.log(`   Response status: ${putResp.status}`);

  if (!putResp.ok) {
    console.error(`❌ PUT failed: ${putResp.status}`);
    const errorText = await putResp.text();
    console.error('   Error:', errorText);

    // Try alternative: PATCH with just ref_qual
    console.log('');
    console.log('Step 3: Trying alternative PATCH approach...');

    const patchResp = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ ref_qual: newRefQual })
    });

    console.log(`   PATCH status: ${patchResp.status}`);

    if (patchResp.ok) {
      const patchData = await patchResp.json();
      console.log('   PATCH response:');
      console.log(JSON.stringify(patchData.result, null, 2));
    } else {
      console.error(`   PATCH also failed: ${await patchResp.text()}`);
    }
  } else {
    const putData = await putResp.json();
    console.log('✅ PUT successful');
    console.log('   Response:');
    console.log(JSON.stringify(putData.result, null, 2));
  }

  // Step 4: Final verification
  console.log('');
  console.log('Step 4: Final verification...');

  await new Promise(resolve => setTimeout(resolve, 3000));

  const verifyResp = await fetch(dictUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
  });

  const verifyData = await verifyResp.json();

  if (verifyData.result && verifyData.result.length > 0) {
    const entry = verifyData.result[0];
    console.log(`   Verified ref_qual: ${entry.ref_qual || '(empty)'}`);

    if (entry.ref_qual && entry.ref_qual.includes('Managed Support Services')) {
      console.log('✅ SUCCESS: Update confirmed!');
    } else {
      console.log('❌ FAILED: Update did not persist');
      console.log('');
      console.log('This field may be read-only via API or require special permissions.');
      console.log('Manual update required in ServiceNow UI:');
      console.log('1. Go to: System Definition > Dictionary');
      console.log('2. Find: task.service_offering');
      console.log('3. Set ref_qual to: javascript:\'parent.name=Managed Support Services\'');
    }
  }

  console.log('');
}

forceFix().catch(console.error);
