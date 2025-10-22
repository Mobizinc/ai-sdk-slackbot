/**
 * Check Reference Qualifier Raw Value
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkRawRefQual() {
  console.log('🔍 Checking Raw Reference Qualifier Value');
  console.log('='.repeat(80));
  console.log('');

  // Query WITHOUT display_value to get raw values
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=task^element=service_offering&sysparm_fields=sys_id,name,element,reference,ref_qual&sysparm_limit=1`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (dictData.result && dictData.result.length > 0) {
    const entry = dictData.result[0];

    console.log('Dictionary Entry (RAW VALUES):');
    console.log(`  sys_id: ${entry.sys_id}`);
    console.log(`  table: ${entry.name}`);
    console.log(`  field: ${entry.element}`);
    console.log(`  reference: ${entry.reference}`);
    console.log(`  ref_qual: ${entry.ref_qual || '(empty)'}`);
    console.log('');

    if (entry.ref_qual && entry.ref_qual.includes('Managed Support Services')) {
      console.log('✅ SUCCESS: Reference qualifier has been updated!');
      console.log('');
      console.log('The reference qualifier now shows:');
      console.log(`  ${entry.ref_qual}`);
      console.log('');
      console.log('This means all 6 Service Offerings under "Managed Support Services"');
      console.log('will now appear in the Service Offering lookup on incidents!');
    } else if (entry.ref_qual && entry.ref_qual.includes('business_service')) {
      console.log('❌ Still shows old value:');
      console.log(`  ${entry.ref_qual}`);
      console.log('');
      console.log('The update may not have saved. Please try again or wait a moment for cache to clear.');
    } else {
      console.log('⚠️  Reference qualifier is empty or has unexpected value');
    }
  } else {
    console.log('❌ Dictionary entry not found');
  }

  console.log('');
}

checkRawRefQual().catch(console.error);
