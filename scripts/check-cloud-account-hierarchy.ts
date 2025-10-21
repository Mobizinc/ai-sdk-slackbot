/**
 * Check Cloud Account Class Hierarchy
 *
 * Investigates the inheritance chain for cloud account tables
 * to find the proper base class for Azure accounts.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function checkHierarchy() {
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ Credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('Checking Cloud Account Class Hierarchy\n');

  // Check AWS Account
  const awsQuery = encodeURIComponent(`name=cmdb_ci_aws_account`);
  const awsUrl = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${awsQuery}&sysparm_fields=name,label,super_class&sysparm_display_value=all`;

  const awsResponse = await fetch(awsUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const awsData = await awsResponse.json();
  const awsTable = awsData.result?.[0];

  if (awsTable) {
    console.log('AWS Account Table:');
    console.log(`  Table: ${awsTable.name?.value || awsTable.name}`);
    console.log(`  Label: ${awsTable.label?.display_value || awsTable.label}`);
    console.log(`  Parent: ${awsTable.super_class?.display_value || '(none)'}`);
    console.log('');

    const parentClassSysId = awsTable.super_class?.value;
    if (parentClassSysId) {
      // Get parent class details
      const parentUrl = `${instanceUrl}/api/now/table/sys_db_object/${parentClassSysId}?sysparm_fields=name,label,super_class&sysparm_display_value=all`;

      const parentResponse = await fetch(parentUrl, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
      });

      const parentData = await parentResponse.json();
      const parent = parentData.result;

      if (parent) {
        console.log('Parent Class:');
        console.log(`  Table: ${parent.name?.value || parent.name}`);
        console.log(`  Label: ${parent.label?.display_value || parent.label}`);
        console.log(`  Its Parent: ${parent.super_class?.display_value || '(base)'}`);
        console.log('');
        console.log(`Azure should use the same parent: ${parent.name?.value || parent.name}`);
      }
    }
  }

  // Check Azure Subscription
  const azSubQuery = encodeURIComponent(`name=cmdb_ci_azure_subscription`);
  const azSubUrl = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${azSubQuery}&sysparm_fields=name,label,super_class&sysparm_display_value=all`;

  const azSubResponse = await fetch(azSubUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const azSubData = await azSubResponse.json();
  const azSubTable = azSubData.result?.[0];

  if (azSubTable) {
    console.log('\nAzure Subscription Table:');
    console.log(`  Table: ${azSubTable.name?.value || azSubTable.name}`);
    console.log(`  Label: ${azSubTable.label?.display_value || azSubTable.label}`);
    console.log(`  Parent: ${azSubTable.super_class?.display_value || '(none)'}`);
  }
}

checkHierarchy().catch(console.error);
