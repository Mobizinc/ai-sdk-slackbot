/**
 * Check Full Details of task.service_offering Dictionary Entry
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkTaskServiceOfferingFull() {
  console.log('🔍 Full Details of task.service_offering Dictionary Entry');
  console.log('='.repeat(80));
  console.log('');

  // Get the full record
  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary/851d0303878011100fadcbb6dabb35b3`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (dictData.result) {
    const entry = dictData.result;

    console.log('FULL DICTIONARY ENTRY:');
    console.log(JSON.stringify(entry, null, 2));
    console.log('');
    console.log('─'.repeat(80));
    console.log('');
    console.log('KEY FIELDS:');
    console.log(`  Table: ${entry.name}`);
    console.log(`  Field: ${entry.element}`);
    console.log(`  Type: ${entry.internal_type}`);
    console.log(`  Reference table: ${entry.reference}`);
    console.log(`  Use reference qualifier: ${entry.use_reference_qualifier}`);
    console.log(`  Reference qual: ${entry.ref_qual || '(empty)'}`);
    console.log(`  Active: ${entry.active}`);
    console.log('');

    // Check if reference field is broken
    if (!entry.reference || entry.reference === '') {
      console.log('❌ PROBLEM FOUND: Reference field is EMPTY!');
      console.log('');
      console.log('This field should reference the "service_offering" table.');
      console.log('Our previous PUT operation may have accidentally cleared it.');
      console.log('');
      console.log('SOLUTION: You need to fix the Reference field first:');
      console.log('1. In the task.service_offering dictionary entry');
      console.log('2. Find the "Reference" field (in the main section, not Reference Specification)');
      console.log('3. Set it to: Offering');
      console.log('4. Then you should see the "Reference Specification" tab appear');
      console.log('5. Then set the Reference qual field');
    } else if (entry.use_reference_qualifier !== 'advanced') {
      console.log('⚠️  Use reference qualifier is set to:', entry.use_reference_qualifier);
      console.log('');
      console.log('It should be set to "advanced" to see the Reference qual field.');
      console.log('');
      console.log('ACTION:');
      console.log('1. Find the "Use reference qualifier" dropdown');
      console.log('2. Change it from "simple" or blank to "advanced"');
      console.log('3. Then the "Reference qual" text field will appear');
    } else {
      console.log('✅ Field configuration looks correct');
      console.log('   The Reference qual field should be visible in the UI');
    }
  } else {
    console.log('❌ Entry not found');
  }

  console.log('');
}

checkTaskServiceOfferingFull().catch(console.error);
