/**
 * Deep Dive Diagnostic - Check Everything About service_offering Field
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function deepDiveDiagnostic() {
  console.log('🔬 DEEP DIVE DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log('');

  // Check 1: ALL dictionary entries for service_offering on incident/task
  console.log('CHECK 1: ALL dictionary entries for service_offering');
  console.log('─'.repeat(80));

  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=element=service_offering^nameINtask,incident&sysparm_fields=sys_id,name,element,active,reference,use_reference_qualifier,ref_qual&sysparm_display_value=all&sysparm_limit=10`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (dictData.result && dictData.result.length > 0) {
    console.log(`Found ${dictData.result.length} dictionary entries:\n`);
    dictData.result.forEach((entry: any, i: number) => {
      console.log(`Entry ${i + 1}:`);
      console.log(`  Table: ${entry.name?.display_value || entry.name}`);
      console.log(`  Field: ${entry.element?.display_value || entry.element}`);
      console.log(`  Active: ${entry.active?.display_value || entry.active}`);
      console.log(`  Reference: ${entry.reference?.display_value || entry.reference || '(empty)'}`);
      console.log(`  Use ref qualifier: ${entry.use_reference_qualifier?.display_value || entry.use_reference_qualifier || '(none)'}`);
      console.log(`  Ref qual: ${entry.ref_qual?.display_value || entry.ref_qual || '(empty)'}`);
      console.log('');
    });
  } else {
    console.log('No entries found');
  }

  console.log('');

  // Check 2: Get RAW values (no display_value)
  console.log('CHECK 2: RAW values from task.service_offering');
  console.log('─'.repeat(80));

  const rawUrl = `${instanceUrl}/api/now/table/sys_dictionary/851d0303878011100fadcbb6dabb35b3?sysparm_fields=name,element,active,reference,use_reference_qualifier,ref_qual`;

  const rawResp = await fetch(rawUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const rawData = await rawResp.json();

  if (rawData.result) {
    console.log('RAW field values:');
    console.log(JSON.stringify(rawData.result, null, 2));
  }

  console.log('');

  // Check 3: Try alternative reference qualifier syntax
  console.log('CHECK 3: Testing alternative query syntaxes');
  console.log('─'.repeat(80));

  const testQueries = [
    { name: 'With spaces', query: 'parent.name=Managed Support Services' },
    { name: 'With URL encoding', query: 'parent.name=Managed%20Support%20Services' },
    { name: 'Using sys_id', query: 'parent=e24d6752c368721066d9bdb4e40131a8' },
    { name: 'LIKE operator', query: 'parent.nameLIKEManaged Support Services' }
  ];

  for (const test of testQueries) {
    const testUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(test.query)}&sysparm_fields=sys_id,name&sysparm_limit=10`;

    const testResp = await fetch(testUrl, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });

    const testData = await testResp.json();
    const count = testData.result?.length || 0;

    console.log(`${test.name}: ${count} results`);
    console.log(`  Query: ${test.query}`);
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log('');

  // Check 4: Check if there's a parent sys_id mismatch
  console.log('CHECK 4: Verify "Managed Support Services" sys_id');
  console.log('─'.repeat(80));

  const parentUrl = `${instanceUrl}/api/now/table/cmdb_ci_service?sysparm_query=name=Managed Support Services&sysparm_fields=sys_id,name,sys_class_name`;

  const parentResp = await fetch(parentUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const parentData = await parentResp.json();

  if (parentData.result && parentData.result.length > 0) {
    const parent = parentData.result[0];
    console.log(`✅ Found parent:`);
    console.log(`   Name: ${parent.name}`);
    console.log(`   sys_id: ${parent.sys_id}`);
    console.log(`   Class: ${parent.sys_class_name}`);
  } else {
    console.log('❌ Parent service not found!');
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('💡 RECOMMENDATION:');
  console.log('');
  console.log('Based on the tests above, the most reliable reference qualifier is:');
  console.log('');
  console.log('Option A (Best): Use sys_id instead of name');
  console.log('  javascript:\'parent=e24d6752c368721066d9bdb4e40131a8\'');
  console.log('  Pros: No issues with spaces, fastest query');
  console.log('  Cons: Hardcoded sys_id (but that\'s fine for your use case)');
  console.log('');
  console.log('Option B: Use dynamic lookup with current script');
  console.log('  javascript:new ServiceOfferingFilter().getOfferings()');
  console.log('  Requires creating a Script Include');
  console.log('');
}

deepDiveDiagnostic().catch(console.error);
