/**
 * Check API User Permissions
 *
 * Verify what permissions the API user has
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkPermissions() {
  console.log('🔐 Checking API User Permissions');
  console.log('='.repeat(100));
  console.log('');

  // Get current user info
  console.log('Step 1: Current user information...');
  const userUrl = `${instanceUrl}/api/now/table/sys_user?sysparm_query=user_name=${username}&sysparm_fields=sys_id,name,user_name,roles&sysparm_display_value=all&sysparm_limit=1`;

  const userResp = await fetch(userUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const userData = await userResp.json();

  if (userData.result && userData.result.length > 0) {
    const user = userData.result[0];
    console.log('User:', user.name?.display_value || user.name);
    console.log('Username:', user.user_name?.value || user.user_name);
    console.log('sys_id:', user.sys_id?.value || user.sys_id);
    console.log('Roles:', user.roles?.display_value || user.roles);
  }

  console.log('');
  console.log('─'.repeat(100));
  console.log('');

  // Check if user can write to sys_dictionary
  console.log('Step 2: Checking sys_dictionary write permissions...');

  const aclUrl = `${instanceUrl}/api/now/table/sys_security_acl?sysparm_query=name=sys_dictionary^operation=write&sysparm_fields=sys_id,name,roles,admin_overrides&sysparm_display_value=all&sysparm_limit=5`;

  const aclResp = await fetch(aclUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const aclData = await aclResp.json();

  if (aclData.result && aclData.result.length > 0) {
    console.log('Found ACL rules for sys_dictionary:');
    aclData.result.forEach((acl: any) => {
      console.log(`  - ${acl.name?.display_value || acl.name}`);
      console.log(`    Required roles: ${acl.roles?.display_value || acl.roles || '(any)'}`);
      console.log(`    Admin overrides: ${acl.admin_overrides?.display_value || acl.admin_overrides}`);
    });
  } else {
    console.log('No ACL rules found (or cannot read ACLs)');
  }

  console.log('');
  console.log('='.repeat(100));
  console.log('');
  console.log('💡 CONCLUSION:');
  console.log('');
  console.log('The API user likely lacks permission to modify sys_dictionary records.');
  console.log('Typically requires the "admin" or "sys_dictionary_admin" role.');
  console.log('');
  console.log('RECOMMENDED SOLUTIONS:');
  console.log('');
  console.log('Option 1: Manual UI Update (Quickest)');
  console.log('  1. Log into ServiceNow as an admin');
  console.log('  2. Navigate to: System Definition > Dictionary');
  console.log('  3. Filter: Table=task, Column=service_offering');
  console.log('  4. Open the record');
  console.log('  5. Scroll to "Reference Specification" section');
  console.log('  6. Change "Reference qual" from:');
  console.log('     javascript:\'parent=\'+current.business_service;');
  console.log('  7. To:');
  console.log('     javascript:\'parent.name=Managed Support Services\'');
  console.log('  8. Save');
  console.log('');
  console.log('Option 2: Grant API User Permissions');
  console.log('  1. Add "admin" role to the API user');
  console.log('  2. Re-run the fix script');
  console.log('');
  console.log('Option 3: Create Update Set');
  console.log('  1. Create an Update Set with the dictionary change');
  console.log('  2. Export and import via API');
  console.log('');
}

checkPermissions().catch(console.error);
