/**
 * Search for Azure Management Group Table
 *
 * Azure hierarchy is: Tenant → Management Group → Subscription → Resource Group
 * Let's find if ServiceNow has a management group table.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function searchManagementGroup() {
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ Credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('🔍 Searching for Azure Management Group Table\n');

  const searchPatterns = [
    'management_group',
    'mgmt_group',
    'management',
  ];

  const foundTables = new Set<string>();

  for (const pattern of searchPatterns) {
    console.log(`Searching pattern: "${pattern}"`);

    const query = encodeURIComponent(`nameLIKE${pattern}^ORlabelLIKE${pattern}`);
    const url = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${query}&sysparm_fields=name,label,super_class&sysparm_display_value=all&sysparm_limit=200`;

    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    const tables = data.result || [];

    for (const table of tables) {
      const name = table.name?.value || table.name;
      const label = table.label?.display_value || table.label;
      const superClass = table.super_class?.display_value || '';

      // Look for CMDB CI tables or Azure-specific tables
      if (name.startsWith('cmdb_ci_') || name.includes('azure') || name.includes('cloud')) {
        if (!foundTables.has(name)) {
          foundTables.add(name);
          console.log(`  ✅ ${name}`);
          console.log(`     Label: ${label}`);
          console.log(`     Parent: ${superClass || '(none)'}`);
          console.log('');
        }
      }
    }
  }

  if (foundTables.size === 0) {
    console.log('\n⚠️  No management group tables found');
    console.log('\nSearching specifically for "azure" + "management"...\n');

    // Try combined search
    const combinedQuery = encodeURIComponent(`nameLIKEazure^nameLIKEmanagement`);
    const combinedUrl = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${combinedQuery}&sysparm_fields=name,label&sysparm_display_value=all`;

    const combinedResponse = await fetch(combinedUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    const combinedData = await combinedResponse.json();
    const combinedTables = combinedData.result || [];

    if (combinedTables.length > 0) {
      for (const table of combinedTables) {
        const name = table.name?.value || table.name;
        const label = table.label?.display_value || table.label;
        console.log(`  ${name} - ${label}`);
      }
    } else {
      console.log('  (none found)');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('💡 Conclusion');
  console.log('='.repeat(70) + '\n');

  if (foundTables.size > 0) {
    console.log(`Found ${foundTables.size} management-related table(s)`);
    console.log('Check above for Azure Management Group table');
  } else {
    console.log('No Azure Management Group table found in ServiceNow');
    console.log('\nAzure Hierarchy in ServiceNow appears to be:');
    console.log('  - cmdb_ci_azure_subscription (top-level)');
    console.log('  - cmdb_ci_resource_group (under subscription)');
    console.log('\nReal Azure hierarchy:');
    console.log('  - Tenant (Azure AD)');
    console.log('  - Management Group (optional)');
    console.log('  - Subscription');
    console.log('  - Resource Group');
    console.log('\nServiceNow flattens: Tenant + Management Group → Subscription');
  }

  console.log('');
}

searchManagementGroup().catch(console.error);
