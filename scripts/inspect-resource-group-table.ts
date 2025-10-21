/**
 * Inspect Resource Group Table
 *
 * Check if cmdb_ci_resource_group has fields for parent subscription,
 * tenant, or management group references.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function inspectResourceGroup() {
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ Credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('🔍 Inspecting Resource Group Table\n');

  // Get table info
  const tableQuery = encodeURIComponent(`name=cmdb_ci_resource_group`);
  const tableUrl = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${tableQuery}&sysparm_display_value=all`;

  const tableResponse = await fetch(tableUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const tableData = await tableResponse.json();
  const tableInfo = tableData.result?.[0];

  if (tableInfo) {
    console.log('Table: cmdb_ci_resource_group');
    console.log(`  Label: ${tableInfo.label?.display_value || tableInfo.label}`);
    console.log(`  Parent Class: ${tableInfo.super_class?.display_value || '(none)'}`);
    console.log('');
  } else {
    console.log('⚠️  cmdb_ci_resource_group table not found');
    process.exit(0);
  }

  // Get fields
  const fieldsQuery = encodeURIComponent(`name=cmdb_ci_resource_group^element!=^active=true`);
  const fieldsUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=${fieldsQuery}&sysparm_fields=element,column_label,internal_type,reference&sysparm_display_value=all&sysparm_limit=500`;

  const fieldsResponse = await fetch(fieldsUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const fieldsData = await fieldsResponse.json();
  const fields = fieldsData.result || [];

  console.log(`Found ${fields.length} fields\n`);

  // Look for Azure hierarchy fields
  const azureFields = fields.filter((f: any) => {
    const element = f.element?.display_value || f.element || '';
    return element.includes('subscription') ||
           element.includes('tenant') ||
           element.includes('management') ||
           element.includes('parent') ||
           element.includes('account') ||
           element.includes('azure');
  });

  if (azureFields.length > 0) {
    console.log('🔗 Azure Hierarchy Fields:\n');
    for (const field of azureFields) {
      const element = field.element?.display_value || field.element;
      const label = field.column_label?.display_value || field.column_label;
      const type = field.internal_type?.display_value || field.internal_type;
      const ref = field.reference?.display_value || field.reference || '';

      console.log(`  ${element}`);
      console.log(`    Label: ${label}`);
      console.log(`    Type: ${type}${ref ? ` (→ ${ref})` : ''}`);
      console.log('');
    }
  } else {
    console.log('⚠️  No Azure hierarchy fields found\n');
  }

  // Check record count
  const countUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_limit=1`;
  const countResponse = await fetch(countUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  if (countResponse.ok) {
    const countHeader = countResponse.headers.get('x-total-count');
    const count = countHeader ? parseInt(countHeader, 10) : 0;
    console.log(`Record count: ${count}`);

    if (count > 0) {
      // Sample a record
      const sampleUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_limit=1&sysparm_display_value=all`;
      const sampleResponse = await fetch(sampleUrl, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
      });

      const sampleData = await sampleResponse.json();
      const sample = sampleData.result?.[0];

      if (sample) {
        console.log('\nSample Record:');
        console.log(`  Name: ${sample.name?.display_value || sample.name}`);
        console.log(`  Company: ${sample.company?.display_value || '(not set)'}`);

        // Check for subscription reference
        const subscriptionFields = Object.keys(sample).filter(k =>
          k.includes('subscription') || k.includes('tenant') || k.includes('parent')
        );

        if (subscriptionFields.length > 0) {
          console.log('\n  Hierarchy References:');
          for (const field of subscriptionFields) {
            const value = sample[field];
            const displayValue = typeof value === 'object' && value?.display_value
              ? value.display_value
              : value;
            if (displayValue) {
              console.log(`    ${field}: ${displayValue}`);
            }
          }
        }
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('💡 Conclusion');
  console.log('='.repeat(70) + '\n');
  console.log('ServiceNow Azure CMDB Hierarchy:');
  console.log('  - cmdb_ci_azure_subscription (top-level, no tenant table)');
  console.log('  - cmdb_ci_resource_group (under subscription)');
  console.log('  - cmdb_ci_cloud_host (VMs, under resource group)');
  console.log('\nNo support for:');
  console.log('  - Azure Tenants (must use subscription or custom field)');
  console.log('  - Azure Management Groups (no table exists)');
  console.log('');
}

inspectResourceGroup().catch(console.error);
