/**
 * List Azure CMDB Tables
 *
 * Discovers which ServiceNow CMDB tables contain Azure/cloud infrastructure data.
 * Queries sys_db_object table to find tables matching Azure/cloud patterns.
 *
 * USAGE:
 *   npx tsx scripts/list-azure-cmdb-tables.ts
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * OUTPUT:
 * - Console report of Azure/cloud tables with record counts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function listAzureTables() {
  console.log('☁️  Discovering Azure CMDB Tables');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  try {
    // Search patterns for Azure/cloud tables
    const searchPatterns = [
      'azure',
      'cloud',
      'tenant',
      'subscription'
    ];

    const foundTables = new Map<string, { label: string; description: string }>();

    console.log('Searching for Azure/Cloud CMDB tables...');
    console.log('');

    for (const pattern of searchPatterns) {
      const query = encodeURIComponent(`nameLIKE${pattern}^ORlabelLIKE${pattern}`);
      const url = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${query}&sysparm_fields=name,label,super_class&sysparm_limit=100`;

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
          const tableName = table.name;
          // Filter to CMDB tables only
          if (tableName.startsWith('cmdb_ci_') || tableName.includes('cloud') || tableName.includes('azure')) {
            foundTables.set(tableName, {
              label: table.label || '',
              description: table.super_class?.display_value || ''
            });
          }
        }
      }
    }

    console.log(`Found ${foundTables.size} Azure/Cloud CMDB table(s)`);
    console.log('');

    if (foundTables.size === 0) {
      console.log('⚠️  No Azure/Cloud CMDB tables found');
      console.log('   This could mean:');
      console.log('   - Azure integration not configured');
      console.log('   - Tables have different naming convention');
      console.log('   - Need to search with different patterns');
      process.exit(0);
    }

    // Query each table to get record count
    console.log('Querying record counts...');
    console.log('');

    const tableDetails: Array<{
      name: string;
      label: string;
      count: number;
    }> = [];

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
          const countData = await countResponse.json();
          const totalHeader = countResponse.headers.get('x-total-count');
          const count = totalHeader ? parseInt(totalHeader, 10) : (countData.result?.length || 0);

          tableDetails.push({
            name: tableName,
            label: info.label,
            count: count
          });
        }
      } catch (error) {
        // Table might not be accessible, skip
        tableDetails.push({
          name: tableName,
          label: info.label,
          count: -1 // Indicates inaccessible
        });
      }
    }

    // Sort by record count (descending), inaccessible tables last
    tableDetails.sort((a, b) => {
      if (a.count === -1) return 1;
      if (b.count === -1) return -1;
      return b.count - a.count;
    });

    // Display results
    console.log('─'.repeat(70));
    console.log('📊 Azure/Cloud CMDB Tables');
    console.log('─'.repeat(70));
    console.log('');

    const tablesWithRecords = tableDetails.filter(t => t.count > 0);
    const emptyTables = tableDetails.filter(t => t.count === 0);
    const inaccessibleTables = tableDetails.filter(t => t.count === -1);

    if (tablesWithRecords.length > 0) {
      console.log(`✅ Tables with Records (${tablesWithRecords.length}):`);
      console.log('');
      for (const table of tablesWithRecords) {
        console.log(`  ${table.name}`);
        console.log(`    Label: ${table.label}`);
        console.log(`    Records: ${table.count}`);
        console.log('');
      }
    }

    if (emptyTables.length > 0) {
      console.log(`⚠️  Empty Tables (${emptyTables.length}):`);
      for (const table of emptyTables) {
        console.log(`  - ${table.name} (${table.label})`);
      }
      console.log('');
    }

    if (inaccessibleTables.length > 0) {
      console.log(`❌ Inaccessible Tables (${inaccessibleTables.length}):`);
      for (const table of inaccessibleTables) {
        console.log(`  - ${table.name} (${table.label})`);
      }
      console.log('');
    }

    // Recommendations
    console.log('─'.repeat(70));
    console.log('💡 Next Steps');
    console.log('─'.repeat(70));
    console.log('');

    if (tablesWithRecords.length > 0) {
      console.log('Recommended tables to query for Azure tenants/subscriptions:');
      const relevantTables = tablesWithRecords.filter(t =>
        t.name.includes('tenant') ||
        t.name.includes('subscription') ||
        t.name.includes('account') ||
        t.name.includes('azure')
      );

      if (relevantTables.length > 0) {
        for (const table of relevantTables) {
          console.log(`  - ${table.name} (${table.count} records)`);
        }
      } else {
        console.log(`  - ${tablesWithRecords[0].name} (${tablesWithRecords[0].count} records) - Start here`);
      }

      console.log('');
      console.log('Next command:');
      console.log(`  npx tsx scripts/discover-altus-azure-tenants.ts`);
    } else {
      console.log('⚠️  No tables with records found');
      console.log('   Azure resources may not be imported into ServiceNow yet');
      console.log('   Or tables use different naming convention');
    }

    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Discovery failed:');
    console.error(error);
    process.exit(1);
  }
}

listAzureTables()
  .catch(console.error)
  .finally(() => process.exit(0));
