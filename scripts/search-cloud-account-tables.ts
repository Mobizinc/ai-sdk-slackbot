/**
 * Search Cloud Account Tables
 *
 * Comprehensive search for cloud account/tenant tables in ServiceNow.
 * Checks sys_db_object for any table that might represent Azure tenants.
 *
 * USAGE:
 *   npx tsx scripts/search-cloud-account-tables.ts
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function searchCloudAccountTables() {
  console.log('🔍 Searching for Cloud Account/Tenant Tables');
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

  try {
    const searchPatterns = [
      'account',
      'tenant',
      'service_account',
      'cloud_account',
      'azure_account',
      'subscription_group'
    ];

    const foundTables = new Map<string, { label: string; superClass: string }>();

    console.log('Searching sys_db_object for cloud account tables...');
    console.log('');

    for (const pattern of searchPatterns) {
      console.log(`  Searching pattern: "${pattern}"`);

      const query = encodeURIComponent(`nameLIKE${pattern}^ORlabelLIKE${pattern}`);
      const url = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${query}&sysparm_fields=name,label,super_class&sysparm_display_value=all&sysparm_limit=200`;

      const response = await fetch(url, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const tables = data.result || [];

        for (const table of tables) {
          const tableName = table.name?.value || table.name;
          const tableLabel = table.label?.display_value || table.label;
          const superClass = table.super_class?.display_value || '';

          // Filter to CMDB and cloud-related tables
          if (tableName.startsWith('cmdb_ci_') ||
              tableName.includes('cloud') ||
              tableName.includes('azure') ||
              tableName.includes('account')) {
            foundTables.set(tableName, {
              label: tableLabel,
              superClass: superClass
            });
          }
        }
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log(`📊 Found ${foundTables.size} Cloud/Account Related Tables`);
    console.log('─'.repeat(70));
    console.log('');

    if (foundTables.size === 0) {
      console.log('⚠️  No cloud account tables found');
      process.exit(0);
    }

    // Check each table for record count
    const tableDetails: Array<{
      name: string;
      label: string;
      superClass: string;
      count: number;
    }> = [];

    console.log('Querying record counts...');
    console.log('');

    for (const [tableName, info] of foundTables.entries()) {
      try {
        const countUrl = `${instanceUrl}/api/now/table/${tableName}?sysparm_limit=1`;
        const countResponse = await fetch(countUrl, {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (countResponse.ok) {
          const totalHeader = countResponse.headers.get('x-total-count');
          const count = totalHeader ? parseInt(totalHeader, 10) : 0;

          tableDetails.push({
            name: tableName,
            label: info.label,
            superClass: info.superClass,
            count: count
          });
        }
      } catch (error) {
        // Table might not be accessible
        tableDetails.push({
          name: tableName,
          label: info.label,
          superClass: info.superClass,
          count: -1
        });
      }
    }

    // Sort by relevance: Azure first, then by record count
    tableDetails.sort((a, b) => {
      const aIsAzure = a.name.includes('azure') ? 1 : 0;
      const bIsAzure = b.name.includes('azure') ? 1 : 0;
      if (aIsAzure !== bIsAzure) return bIsAzure - aIsAzure;

      if (a.count === -1) return 1;
      if (b.count === -1) return -1;
      return b.count - a.count;
    });

    // Display results
    const tablesWithRecords = tableDetails.filter(t => t.count > 0);
    const emptyTables = tableDetails.filter(t => t.count === 0);
    const inaccessibleTables = tableDetails.filter(t => t.count === -1);

    if (tablesWithRecords.length > 0) {
      console.log('✅ Tables with Records:');
      console.log('');
      for (const table of tablesWithRecords) {
        console.log(`  ${table.name}`);
        console.log(`    Label: ${table.label}`);
        console.log(`    Super Class: ${table.superClass || '(none)'}`);
        console.log(`    Records: ${table.count}`);
        console.log('');
      }
    }

    if (emptyTables.length > 0) {
      console.log('⚠️  Empty Tables (Potential for Use):');
      console.log('');
      for (const table of emptyTables) {
        console.log(`  ${table.name}`);
        console.log(`    Label: ${table.label}`);
        console.log(`    Super Class: ${table.superClass || '(none)'}`);
        console.log('');
      }
    }

    console.log('─'.repeat(70));
    console.log('💡 Recommended Table for Azure Tenants');
    console.log('─'.repeat(70));
    console.log('');

    // Look for best tenant table candidate
    const tenantCandidates = tableDetails.filter(t =>
      t.name.includes('account') ||
      t.name.includes('tenant') ||
      (t.name.includes('cloud') && !t.name.includes('subscription'))
    );

    if (tenantCandidates.length > 0) {
      console.log('Top candidates for Azure Tenant representation:');
      console.log('');
      for (const table of tenantCandidates.slice(0, 5)) {
        console.log(`  ${table.name} (${table.label})`);
        console.log(`    Records: ${table.count >= 0 ? table.count : 'Inaccessible'}`);
        console.log('');
      }
    } else {
      console.log('⚠️  No obvious tenant table found');
      console.log('   Consider using cmdb_ci_azure_subscription with tenant metadata');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Search failed:');
    console.error(error);
    process.exit(1);
  }
}

searchCloudAccountTables()
  .catch(console.error)
  .finally(() => process.exit(0));
