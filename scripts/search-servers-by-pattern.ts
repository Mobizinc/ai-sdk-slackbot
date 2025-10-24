/**
 * Search Servers by Name Pattern (Diagnostic Tool)
 *
 * Searches for servers matching a name pattern, regardless of company association.
 * Useful for discovering how servers are named and which company they're linked to.
 *
 * USAGE:
 *   npx tsx scripts/search-servers-by-pattern.ts "Altus"
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function searchServers(pattern: string) {
  console.log(`🔍 Searching for servers matching: "${pattern}"`);
  console.log('='.repeat(70));
  console.log('');

  if (!pattern) {
    console.error('❌ Usage: npx tsx scripts/search-servers-by-pattern.ts "Pattern"');
    process.exit(1);
  }

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const serverTables = [
    { table: 'cmdb_ci_server', description: 'Base Servers' },
    { table: 'cmdb_ci_win_server', description: 'Windows Servers' },
    { table: 'cmdb_ci_linux_server', description: 'Linux Servers' },
    { table: 'cmdb_ci_esx_server', description: 'ESXi Hosts' },
    { table: 'cmdb_ci_vm_instance', description: 'Virtual Machines' },
  ];

  let totalFound = 0;

  for (const serverTable of serverTables) {
    console.log(`Checking ${serverTable.description}...`);

    const query = encodeURIComponent(`nameLIKE${pattern}`);
    const fields = 'sys_id,name,company,location,ip_address,used_for,install_status,operational_status,sys_class_name';
    const url = `${instanceUrl}/api/now/table/${serverTable.table}?sysparm_query=${query}&sysparm_display_value=all&sysparm_fields=${fields}&sysparm_limit=100`;

    try {
      const response = await fetch(url, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.log(`  ⚠️  Table not accessible`);
        continue;
      }

      const data = await response.json();
      const servers = data.result || [];

      if (servers.length > 0) {
        console.log(`  ✅ Found ${servers.length} server(s)`);
        console.log('');

        for (const server of servers.slice(0, 10)) { // Show first 10
          console.log(`  ${server.name?.display_value || server.name}`);
          console.log(`    sys_id: ${server.sys_id?.value || server.sys_id}`);
          console.log(`    company: ${server.company?.display_value || '(not set)'}`);
          console.log(`    location: ${server.location?.display_value || '(not set)'}`);
          console.log(`    IP: ${server.ip_address?.display_value || server.ip_address || '(not set)'}`);
          console.log(`    service: ${server.used_for?.display_value || '(not set)'}`);
          console.log(`    status: ${server.install_status?.display_value || '(not set)'} / ${server.operational_status?.display_value || '(not set)'}`);
          console.log('');
        }

        if (servers.length > 10) {
          console.log(`  ... and ${servers.length - 10} more`);
          console.log('');
        }

        totalFound += servers.length;
      } else {
        console.log(`  No servers found`);
      }
    } catch (error) {
      console.log(`  ❌ Query error: ${error}`);
    }

    console.log('');
  }

  console.log('─'.repeat(70));
  console.log(`Total servers found matching "${pattern}": ${totalFound}`);
  console.log('');
}

const pattern = process.argv[2];
searchServers(pattern).catch(console.error).finally(() => process.exit(0));
