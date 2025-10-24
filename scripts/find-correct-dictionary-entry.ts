/**
 * Find the Correct Dictionary Entry
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function findCorrectEntry() {
  console.log('🔍 Searching for ALL service_offering Dictionary Entries');
  console.log('='.repeat(80));
  console.log('');

  // Search for ALL dictionary entries with service_offering
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=elementLIKEservice_offering&sysparm_fields=sys_id,name,element,ref_qual,sys_update_name&sysparm_limit=20`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (dictData.result && dictData.result.length > 0) {
    console.log(`Found ${dictData.result.length} dictionary entries:\n`);

    dictData.result.forEach((entry: any, i: number) => {
      console.log(`${i + 1}. Table: ${entry.name}`);
      console.log(`   Field: ${entry.element}`);
      console.log(`   sys_id: ${entry.sys_id}`);
      console.log(`   sys_update_name: ${entry.sys_update_name}`);
      console.log(`   ref_qual: ${entry.ref_qual || '(empty)'}`);
      console.log('');
    });

    // Look for one with "Managed Support Services"
    const updated = dictData.result.find((e: any) =>
      e.ref_qual && e.ref_qual.includes('Managed Support Services')
    );

    if (updated) {
      console.log('✅ FOUND THE UPDATED ENTRY:');
      console.log(`   Table: ${updated.name}`);
      console.log(`   Field: ${updated.element}`);
      console.log(`   ref_qual: ${updated.ref_qual}`);
      console.log('');
      console.log('✅ Your change WAS saved successfully!');
    } else {
      console.log('⚠️  No entry found with "Managed Support Services" in ref_qual');
      console.log('');
      console.log('Possible reasons:');
      console.log('1. Change is still propagating (wait 30 seconds and try again)');
      console.log('2. Wrong dictionary entry was updated');
      console.log('3. API cache hasn\'t refreshed yet');
    }
  } else {
    console.log('❌ No dictionary entries found');
  }

  console.log('');
}

findCorrectEntry().catch(console.error);
