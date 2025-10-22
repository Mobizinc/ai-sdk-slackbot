/**
 * Fix Service Offering Reference Qualifier
 *
 * Changes the reference qualifier on task.service_offering field to show
 * all Service Offerings under "Managed Support Services" portfolio.
 *
 * Before: javascript:'parent='+current.business_service;
 * After:  javascript:'parent.name=Managed Support Services'
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment based on command line argument
const env = process.argv[2] === 'prod' ? 'SERVICENOW' : 'UAT_SERVICENOW';
dotenv.config({ path: '.env.local' });

const instanceUrl = env === 'SERVICENOW'
  ? 'https://mobiz.service-now.com'
  : process.env.UAT_SERVICENOW_URL || 'https://mobizuat.service-now.com';
const username = process.env[`${env}_USERNAME`];
const password = process.env[`${env}_PASSWORD`];

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function fixReferenceQualifier() {
  const environment = env === 'SERVICENOW' ? 'PROD' : 'UAT';
  console.log(`🔧 Fixing Service Offering Reference Qualifier (${environment})`);
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Find the dictionary entry for task.service_offering
  console.log('Step 1: Looking up dictionary entry for task.service_offering...');
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=task^element=service_offering&sysparm_fields=sys_id,element,reference,ref_qual&sysparm_display_value=all`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (!dictData.result || dictData.result.length === 0) {
    console.log('❌ Dictionary entry not found for task.service_offering');
    return;
  }

  const dictEntry = dictData.result[0];
  const sysId = dictEntry.sys_id?.value || dictEntry.sys_id;
  const currentRefQual = dictEntry.ref_qual?.display_value || dictEntry.ref_qual || '(empty)';

  console.log('✅ Found dictionary entry:');
  console.log(`   sys_id: ${sysId}`);
  console.log(`   Field: ${dictEntry.element?.value || dictEntry.element}`);
  console.log(`   Reference Table: ${dictEntry.reference?.display_value || dictEntry.reference}`);
  console.log(`   Current Reference Qualifier: ${currentRefQual}`);
  console.log('');

  // Step 2: Update the reference qualifier
  console.log('Step 2: Updating reference qualifier...');

  const newRefQual = "javascript:'parent.name=Managed Support Services'";

  console.log(`   Old: ${currentRefQual}`);
  console.log(`   New: ${newRefQual}`);
  console.log('');

  const updateUrl = `${instanceUrl}/api/now/table/sys_dictionary/${sysId}`;

  const updateResp = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ref_qual: newRefQual
    })
  });

  if (!updateResp.ok) {
    const errorText = await updateResp.text();
    console.log('❌ Failed to update reference qualifier');
    console.log(`   Status: ${updateResp.status}`);
    console.log(`   Error: ${errorText}`);
    return;
  }

  const updateData = await updateResp.json();
  console.log('✅ Successfully updated reference qualifier!');
  console.log('');

  // Step 3: Verify the update
  console.log('Step 3: Verifying update...');
  const verifyResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const verifyData = await verifyResp.json();
  if (verifyData.result && verifyData.result.length > 0) {
    const updatedEntry = verifyData.result[0];
    const updatedRefQual = updatedEntry.ref_qual?.display_value || updatedEntry.ref_qual;

    console.log(`   Updated Reference Qualifier: ${updatedRefQual}`);

    if (updatedRefQual === newRefQual) {
      console.log('✅ Verification successful!');
    } else {
      console.log('⚠️  Warning: Updated value does not match expected value');
    }
  }
  console.log('');

  // Step 4: Test query
  console.log('Step 4: Testing - querying Service Offerings that will now appear...');
  const testUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=parent.name=Managed Support Services&sysparm_fields=sys_id,name&sysparm_display_value=all`;

  const testResp = await fetch(testUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const testData = await testResp.json();

  if (testData.result && testData.result.length > 0) {
    console.log(`✅ Found ${testData.result.length} Service Offerings that will be available:`);
    testData.result.forEach((offering: any, index: number) => {
      const name = offering.name?.display_value || offering.name;
      console.log(`   ${index + 1}. ${name}`);
    });
  } else {
    console.log('⚠️  Warning: No Service Offerings found matching the new qualifier');
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('✅ Reference qualifier fix complete!');
  console.log('');
  console.log('Next Steps:');
  console.log('1. Open any incident in ServiceNow');
  console.log('2. Click the Service Offering field');
  console.log('3. You should now see all 6 Service Offerings');
  console.log('');
}

fixReferenceQualifier().catch(console.error);
