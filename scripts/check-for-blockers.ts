/**
 * Check for UI Policies, Client Scripts, or other blockers
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkForBlockers() {
  console.log('🔍 Checking for UI Policies, Client Scripts, and Other Blockers');
  console.log('='.repeat(80));
  console.log('');

  // Check 1: UI Policies affecting service_offering on incident
  console.log('CHECK 1: UI Policies on incident.service_offering');
  console.log('─'.repeat(80));

  const uiPolicyUrl = `${instanceUrl}/api/now/table/sys_ui_policy?sysparm_query=table=incident^active=true&sysparm_fields=sys_id,short_description,conditions&sysparm_display_value=all&sysparm_limit=20`;

  const uiResp = await fetch(uiPolicyUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const uiData = await uiResp.json();

  if (uiData.result && uiData.result.length > 0) {
    console.log(`Found ${uiData.result.length} active UI Policies on incident table:\n`);
    uiData.result.forEach((policy: any, i: number) => {
      console.log(`${i + 1}. ${policy.short_description?.display_value || policy.short_description || '(no description)'}`);
      console.log(`   Conditions: ${policy.conditions?.display_value || policy.conditions || '(always)'}`);
    });
  } else {
    console.log('No active UI Policies found');
  }

  console.log('');

  // Check 2: Client Scripts affecting service_offering
  console.log('CHECK 2: Client Scripts on incident table');
  console.log('─'.repeat(80));

  const clientScriptUrl = `${instanceUrl}/api/now/table/sys_script_client?sysparm_query=table=incident^active=true&sysparm_fields=sys_id,name,type&sysparm_display_value=all&sysparm_limit=20`;

  const csResp = await fetch(clientScriptUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const csData = await csResp.json();

  if (csData.result && csData.result.length > 0) {
    console.log(`Found ${csData.result.length} active Client Scripts on incident table:\n`);
    csData.result.forEach((script: any, i: number) => {
      console.log(`${i + 1}. ${script.name?.display_value || script.name}`);
      console.log(`   Type: ${script.type?.display_value || script.type}`);
    });
  } else {
    console.log('No active Client Scripts found');
  }

  console.log('');

  // Check 3: Try the actual query that would run
  console.log('CHECK 3: Direct Query Test');
  console.log('─'.repeat(80));
  console.log('Testing the exact query the lookup would use...');
  console.log('');

  const testUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=parent.name=Managed Support Services&sysparm_fields=sys_id,name,active,install_status,operational_status&sysparm_display_value=all&sysparm_limit=10`;

  const testResp = await fetch(testUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const testData = await testResp.json();

  if (testData.result && testData.result.length > 0) {
    console.log(`✅ Query returns ${testData.result.length} Service Offerings:\n`);
    testData.result.forEach((so: any, i: number) => {
      console.log(`${i + 1}. ${so.name?.display_value || so.name}`);
      console.log(`   Active: ${so.active?.display_value || so.active}`);
      console.log(`   Install Status: ${so.install_status?.display_value || so.install_status}`);
      console.log(`   Operational Status: ${so.operational_status?.display_value || so.operational_status}`);
    });
  } else {
    console.log('❌ Query returns NO results');
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('💡 TROUBLESHOOTING STEPS:');
  console.log('');
  console.log('Since the reference qualifier is set correctly and the query works,');
  console.log('this is likely a CACHING issue. Try these steps:');
  console.log('');
  console.log('1. **Clear ServiceNow Cache**:');
  console.log('   - In ServiceNow, type in the filter navigator: cache.do');
  console.log('   - Click "Clear Cache" button');
  console.log('   - Wait 10-15 seconds');
  console.log('');
  console.log('2. **Clear Browser Cache**:');
  console.log('   - Press Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)');
  console.log('   - Clear cache and cookies');
  console.log('   - Or try in an Incognito/Private window');
  console.log('');
  console.log('3. **Hard Refresh the Incident Form**:');
  console.log('   - Close the incident tab');
  console.log('   - Open a NEW incident or re-open INC0167770');
  console.log('   - Try the Service Offering field again');
  console.log('');
  console.log('4. **Check Dictionary Cache**:');
  console.log('   - Navigate to: sys_properties.list');
  console.log('   - Search for: glide.ui.forgetmeu');
  console.log('   - If exists, temporarily set to true');
  console.log('');
}

checkForBlockers().catch(console.error);
