/**
 * Final Check - Look for incident-specific override
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function finalCheck() {
  console.log('🔍 FINAL CHECK - Looking for incident table override');
  console.log('='.repeat(80));
  console.log('');

  // Check if there's a dictionary entry specifically for incident.service_offering
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=incident^element=service_offering&sysparm_fields=sys_id,name,element,active,reference,ref_qual,use_reference_qualifier`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (dictData.result && dictData.result.length > 0) {
    console.log('❗ FOUND IT! There IS a dictionary entry for incident.service_offering');
    console.log('This is overriding the task.service_offering entry!');
    console.log('');

    dictData.result.forEach((entry: any) => {
      console.log('Entry details:');
      console.log(`  sys_id: ${entry.sys_id}`);
      console.log(`  Table: ${entry.name}`);
      console.log(`  Field: ${entry.element}`);
      console.log(`  Active: ${entry.active}`);
      console.log(`  Reference: ${entry.reference || '(empty)'}`);
      console.log(`  Use ref qualifier: ${entry.use_reference_qualifier || '(none)'}`);
      console.log(`  Ref qual: ${entry.ref_qual || '(empty)'}`);
      console.log('');
    });

    console.log('⚠️ YOU NEED TO UPDATE THIS ENTRY, NOT THE TASK ONE!');
    console.log('');
    console.log('Go to System Definition > Dictionary and find:');
    console.log('  Table: incident (not task)');
    console.log('  Column: service_offering');
    console.log('');
    console.log('Then update the reference qualifier on THAT entry.');
  } else {
    console.log('✅ No incident-specific override found');
    console.log('The task.service_offering entry should be used.');
    console.log('');
    console.log('❗ IMPORTANT: When entering the reference qualifier in the UI,');
    console.log('DO NOT include "javascript:" - ServiceNow adds that automatically!');
    console.log('');
    console.log('You should enter ONLY:');
    console.log("  'parent=e24d6752c368721066d9bdb4e40131a8'");
    console.log('');
    console.log('NOT:');
    console.log("  javascript:'parent=e24d6752c368721066d9bdb4e40131a8'");
    console.log('');
    console.log('If you entered it WITH "javascript:", it would create:');
    console.log("  javascript:javascript:'parent=e24d6752c368721066d9bdb4e40131a8'");
    console.log('Which would break the qualifier!');
  }

  console.log('');
}

finalCheck().catch(console.error);
