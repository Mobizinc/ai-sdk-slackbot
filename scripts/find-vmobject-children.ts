/**
 * Find Child Tables of cmdb_ci_vm_object
 *
 * Lists all tables that extend Virtual Machine Object to see
 * if there's a cloud account base table.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function findChildren() {
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ Credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('Finding tables that extend cmdb_ci_vm_object\n');

  // Find all tables with super_class = cmdb_ci_vm_object
  const query = encodeURIComponent(`super_class.name=cmdb_ci_vm_object^ORDERBYname`);
  const url = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${query}&sysparm_fields=name,label&sysparm_display_value=all&sysparm_limit=200`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const data = await response.json();
  const tables = data.result || [];

  console.log(`Found ${tables.length} tables extending cmdb_ci_vm_object:\n`);

  const cloudTables = [];
  const azureTables = [];
  const awsTables = [];

  for (const table of tables) {
    const name = table.name?.value || table.name;
    const label = table.label?.display_value || table.label;

    console.log(`  ${name} - ${label}`);

    if (name.includes('cloud') || name.includes('account')) {
      cloudTables.push({ name, label });
    }
    if (name.includes('azure')) {
      azureTables.push({ name, label });
    }
    if (name.includes('aws')) {
      awsTables.push({ name, label });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Cloud/Account Tables:');
  console.log('='.repeat(70) + '\n');

  if (cloudTables.length > 0) {
    for (const t of cloudTables) {
      console.log(`  ${t.name} - ${t.label}`);
    }
  } else {
    console.log('  (none found)');
  }

  console.log('\nAzure Tables:');
  for (const t of azureTables) {
    console.log(`  ${t.name} - ${t.label}`);
  }

  console.log('\nAWS Tables:');
  for (const t of awsTables) {
    console.log(`  ${t.name} - ${t.label}`);
  }
}

findChildren().catch(console.error);
