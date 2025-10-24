/**
 * Check task_service_offering.service_offering Dictionary Entry
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkTaskServiceOfferingTable() {
  console.log('🔍 Checking task_service_offering.service_offering Entry');
  console.log('='.repeat(80));
  console.log('');

  // Query the specific sys_id we found: 9a2d8b03878011100fadcbb6dabb35c6
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary/9a2d8b03878011100fadcbb6dabb35c6?sysparm_fields=sys_id,name,element,ref_qual,use_reference_qualifier,reference`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (dictData.result) {
    const entry = dictData.result;

    console.log('Dictionary Entry:');
    console.log(`  sys_id: ${entry.sys_id}`);
    console.log(`  Table: ${entry.name}`);
    console.log(`  Field: ${entry.element}`);
    console.log(`  Reference table: ${entry.reference}`);
    console.log(`  Use reference qualifier: ${entry.use_reference_qualifier || '(not set)'}`);
    console.log(`  ref_qual: ${entry.ref_qual || '(empty)'}`);
    console.log('');

    if (entry.ref_qual && entry.ref_qual.includes('Managed Support Services')) {
      console.log('✅ SUCCESS! Your change is there!');
      console.log(`   ref_qual: ${entry.ref_qual}`);
      console.log('');
      console.log('However, task_service_offering is a LINKING TABLE (many-to-many relationship)');
      console.log('between tasks and service offerings.');
      console.log('');
      console.log('The field that appears on INCIDENT forms is task.service_offering (entry #10),');
      console.log('not task_service_offering.service_offering.');
      console.log('');
      console.log('YOU NEED TO UPDATE THE OTHER ENTRY: task.service_offering');
      console.log('sys_id: 851d0303878011100fadcbb6dabb35b3');
    } else {
      console.log('⚠️  ref_qual is still empty or has old value');
    }
  } else {
    console.log('❌ Entry not found');
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log('');
  console.log('ACTION REQUIRED:');
  console.log('');
  console.log('Go back to ServiceNow and find the correct dictionary entry:');
  console.log('');
  console.log('1. Navigate to: System Definition > Dictionary');
  console.log('2. Filter by:');
  console.log('   Table: task (not task_service_offering)');
  console.log('   Column: service_offering');
  console.log('3. Open that record (sys_id: 851d0303878011100fadcbb6dabb35b3)');
  console.log('4. Set ref_qual to: javascript:\'parent.name=Managed Support Services\'');
  console.log('5. Click Update');
  console.log('');
}

checkTaskServiceOfferingTable().catch(console.error);
