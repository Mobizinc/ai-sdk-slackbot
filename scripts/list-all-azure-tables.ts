/**
 * List ALL Azure Tables
 *
 * Comprehensive list of every table with "azure" in the name.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function listAllAzureTables() {
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const query = encodeURIComponent(`nameLIKEazure`);
  const url = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=${query}&sysparm_fields=name,label,super_class&sysparm_display_value=all&sysparm_limit=500`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const data = await response.json();
  const tables = data.result || [];

  console.log(`\nFound ${tables.length} tables with "azure" in name:\n`);

  for (const table of tables) {
    const name = table.name?.value || table.name;
    const label = table.label?.display_value || table.label;
    const superClass = table.super_class?.display_value || '';

    console.log(`${name}`);
    console.log(`  Label: ${label}`);
    if (superClass) {
      console.log(`  Parent: ${superClass}`);
    }
    console.log('');
  }
}

listAllAzureTables().catch(console.error);
