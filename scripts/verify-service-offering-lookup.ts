/**
 * Verify Service Offering Lookup Works
 *
 * Simulates what happens when a user clicks the Service Offering field
 * on an incident to verify all 6 offerings are now available.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function verifyServiceOfferingLookup() {
  console.log('🔍 Verifying Service Offering Lookup on INC0167770');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Get the incident
  console.log('Step 1: Fetching incident INC0167770...');
  const incUrl = `${instanceUrl}/api/now/table/incident?sysparm_query=number=INC0167770&sysparm_fields=sys_id,number,business_service,service_offering&sysparm_display_value=all&sysparm_limit=1`;

  const incResp = await fetch(incUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const incData = await incResp.json();

  if (!incData.result || incData.result.length === 0) {
    console.log('❌ Incident INC0167770 not found');
    return;
  }

  const incident = incData.result[0];
  console.log('✅ Incident found:');
  console.log(`   Number: ${incident.number?.value || incident.number}`);
  console.log(`   Business Service: ${incident.business_service?.display_value || incident.business_service || '(none)'}`);
  console.log(`   Current Service Offering: ${incident.service_offering?.display_value || incident.service_offering || '(none)'}`);
  console.log('');

  // Step 2: Query Service Offerings using the new reference qualifier
  console.log('Step 2: Querying Service Offerings that will appear in lookup...');
  console.log('   (Using reference qualifier: parent.name=Managed Support Services)');
  console.log('');

  const offeringsUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=parent.name=Managed Support Services&sysparm_fields=sys_id,name,parent&sysparm_display_value=all&sysparm_limit=20`;

  const offeringsResp = await fetch(offeringsUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const offeringsData = await offeringsResp.json();

  if (!offeringsData.result || offeringsData.result.length === 0) {
    console.log('❌ No Service Offerings found!');
    console.log('   This means the lookup will still show "No records to display"');
    return;
  }

  console.log(`✅ Found ${offeringsData.result.length} Service Offerings available:`);
  console.log('');
  offeringsData.result.forEach((offering: any, index: number) => {
    const name = offering.name?.display_value || offering.name;
    const parent = offering.parent?.display_value || offering.parent;
    console.log(`   ${index + 1}. ${name}`);
    console.log(`      Parent: ${parent}`);
  });
  console.log('');

  // Step 3: Summary
  console.log('='.repeat(80));
  console.log('✅ Verification Complete!');
  console.log('');
  console.log('Result:');
  console.log(`   - ${offeringsData.result.length} Service Offerings will appear in the lookup`);
  console.log('   - Users can now select any of these offerings on incidents');
  console.log('');
  console.log('To test in the UI:');
  console.log('   1. Go to https://mobiz.service-now.com');
  console.log('   2. Open incident INC0167770');
  console.log('   3. Click the magnifying glass next to Service Offering field');
  console.log(`   4. You should see all ${offeringsData.result.length} offerings listed above`);
  console.log('');
}

verifyServiceOfferingLookup().catch(console.error);
