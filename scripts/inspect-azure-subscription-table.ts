/**
 * Inspect Azure Subscription Table Structure
 *
 * Queries ServiceNow to understand the schema of cmdb_ci_azure_subscription table.
 * Identifies required fields, optional fields, and parent class structure.
 *
 * USAGE:
 *   npx tsx scripts/inspect-azure-subscription-table.ts
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * OUTPUT:
 * - Console report of table structure
 * - Field definitions with types and requirements
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function inspectAzureSubscriptionTable() {
  console.log('🔍 Inspecting Azure Subscription Table Structure');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`URL: ${instanceUrl}`);
  console.log('');

  try {
    // Get table definition
    console.log('Querying table definition from sys_db_object...');
    const tableUrl = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=name=cmdb_ci_azure_subscription&sysparm_display_value=all`;

    const tableResponse = await fetch(tableUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    if (tableResponse.ok) {
      const tableData = await tableResponse.json();
      const tableInfo = tableData.result?.[0];

      if (tableInfo) {
        console.log('✅ Table found: cmdb_ci_azure_subscription');
        console.log(`   Label: ${tableInfo.label?.display_value || tableInfo.label}`);
        console.log(`   Super Class: ${tableInfo.super_class?.display_value || '(none)'}`);
        console.log('');
      }
    }

    // Get field definitions
    console.log('Querying field definitions from sys_dictionary...');
    const fieldsUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=cmdb_ci_azure_subscription^active=true&sysparm_display_value=all&sysparm_fields=element,column_label,internal_type,mandatory,max_length,default_value,reference&sysparm_limit=200`;

    const fieldsResponse = await fetch(fieldsUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    if (!fieldsResponse.ok) {
      console.error(`❌ Failed to query fields: ${fieldsResponse.status}`);
      process.exit(1);
    }

    const fieldsData = await fieldsResponse.json();
    const fields = fieldsData.result || [];

    console.log(`✅ Found ${fields.length} field(s)`);
    console.log('');

    // Categorize fields
    const mandatoryFields = fields.filter((f: any) => f.mandatory?.value === 'true' || f.mandatory === 'true');
    const referenceFields = fields.filter((f: any) => f.internal_type?.display_value === 'Reference' || f.internal_type === 'reference');
    const standardFields = fields.filter((f: any) =>
      !f.element?.display_value?.startsWith('sys_') &&
      f.element?.display_value !== '' &&
      (f.mandatory?.value !== 'true' && f.mandatory !== 'true')
    );

    console.log('─'.repeat(70));
    console.log('📋 Mandatory Fields');
    console.log('─'.repeat(70));
    console.log('');

    if (mandatoryFields.length > 0) {
      for (const field of mandatoryFields) {
        const element = field.element?.display_value || field.element;
        const label = field.column_label?.display_value || field.column_label;
        const type = field.internal_type?.display_value || field.internal_type;
        const ref = field.reference?.display_value || field.reference || '';

        console.log(`  ${element}`);
        console.log(`    Label: ${label}`);
        console.log(`    Type: ${type}${ref ? ` (Reference: ${ref})` : ''}`);
        console.log('');
      }
    } else {
      console.log('  (No mandatory fields besides inherited ones)');
      console.log('');
    }

    console.log('─'.repeat(70));
    console.log('🔗 Reference Fields (Relationships)');
    console.log('─'.repeat(70));
    console.log('');

    if (referenceFields.length > 0) {
      for (const field of referenceFields) {
        const element = field.element?.display_value || field.element;
        const label = field.column_label?.display_value || field.column_label;
        const ref = field.reference?.display_value || field.reference || '';

        if (element && !element.startsWith('sys_')) {
          console.log(`  ${element} → ${ref}`);
          console.log(`    Label: ${label}`);
          console.log('');
        }
      }
    }

    console.log('─'.repeat(70));
    console.log('📝 Key Standard Fields');
    console.log('─'.repeat(70));
    console.log('');

    const importantFields = standardFields.filter((f: any) => {
      const element = f.element?.display_value || f.element;
      return element && (
        element.includes('subscription') ||
        element.includes('tenant') ||
        element.includes('account') ||
        element.includes('name') ||
        element.includes('id') ||
        element.includes('status')
      );
    });

    if (importantFields.length > 0) {
      for (const field of importantFields.slice(0, 20)) {
        const element = field.element?.display_value || field.element;
        const label = field.column_label?.display_value || field.column_label;
        const type = field.internal_type?.display_value || field.internal_type;

        console.log(`  ${element}`);
        console.log(`    Label: ${label}`);
        console.log(`    Type: ${type}`);
        console.log('');
      }
    }

    // Check for cloud service account table (potential tenant table)
    console.log('─'.repeat(70));
    console.log('🔍 Checking for Cloud Service Account Table (Tenant Level)');
    console.log('─'.repeat(70));
    console.log('');

    const csa_table_url = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=name=cmdb_ci_cloud_service_account&sysparm_display_value=all`;

    const csaResponse = await fetch(csa_table_url, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    if (csaResponse.ok) {
      const csaData = await csaResponse.json();
      const csaInfo = csaData.result?.[0];

      if (csaInfo) {
        console.log('✅ Cloud Service Account table exists');
        console.log(`   Table: cmdb_ci_cloud_service_account`);
        console.log(`   Label: ${csaInfo.label?.display_value || csaInfo.label}`);
        console.log(`   Super Class: ${csaInfo.super_class?.display_value || '(none)'}`);
        console.log('');
        console.log('   This table can be used for Azure Tenants');
      } else {
        console.log('⚠️  Cloud Service Account table not found');
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('💡 Recommendations');
    console.log('─'.repeat(70));
    console.log('');
    console.log('For Azure Tenant representation:');
    console.log('  - Use: cmdb_ci_cloud_service_account (if exists)');
    console.log('  - Or: Create custom "tenant_id" field on subscription records');
    console.log('');
    console.log('For Azure Subscription CIs:');
    console.log('  - Table: cmdb_ci_azure_subscription');
    console.log('  - Required fields: name, company');
    console.log('  - Link to: Service Offering (Infrastructure and Cloud Management)');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Inspection failed:');
    console.error(error);
    process.exit(1);
  }
}

inspectAzureSubscriptionTable()
  .catch(console.error)
  .finally(() => process.exit(0));
