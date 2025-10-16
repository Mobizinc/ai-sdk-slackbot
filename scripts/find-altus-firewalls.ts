/**
 * Find Altus Firewalls
 *
 * Search for Altus firewalls across different CMDB tables
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function findAltusFirewalls() {
  console.log('🔍 Searching for Altus Firewalls');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.DEV_SERVICENOW_URL || process.env.SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME || process.env.SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD || process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const environment = process.env.DEV_SERVICENOW_URL ? 'DEV' : 'PRODUCTION';
  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Common CMDB tables for network devices
  const tables = [
    'cmdb_ci_lb',              // Load Balancer
    'cmdb_ci_netgear',         // Network Gear
    'cmdb_ci_firewall',        // Firewall (if exists)
    'cmdb_ci_appl',            // Application
    'cmdb_ci_ip_firewall',     // IP Firewall
    'cmdb_ci_ip_router',       // IP Router
    'cmdb_ci_network_adapter', // Network Adapter
    'cmdb_ci',                 // Generic CI
  ];

  for (const table of tables) {
    console.log(`Checking table: ${table}`);
    console.log('─'.repeat(70));

    const query = encodeURIComponent('nameLIKEAltus');
    const url = `${instanceUrl}/api/now/table/${table}?sysparm_query=${query}&sysparm_limit=5&sysparm_display_value=all`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const count = data.result?.length || 0;

        if (count > 0) {
          console.log(`✅ Found ${count} Altus record(s) in ${table}`);
          for (const record of data.result) {
            const name = record.name?.display_value || record.name;
            const sysId = record.sys_id?.value || record.sys_id;
            const location = record.location?.display_value || '(no location)';
            console.log(`   - ${name} (${location})`);
            console.log(`     sys_id: ${sysId}`);
          }
        } else {
          console.log(`   No Altus records in ${table}`);
        }
      } else {
        console.log(`   ⚠️  Table does not exist or not accessible`);
      }
    } catch (error) {
      console.log(`   ❌ Error querying ${table}: ${error}`);
    }

    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('✅ Search complete');
}

findAltusFirewalls()
  .catch(console.error)
  .finally(() => process.exit(0));
