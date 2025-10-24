/**
 * Research IP Network Table Structure
 *
 * Query ServiceNow PROD to understand the cmdb_ci_ip_network table structure
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function researchIPNetworkTable() {
  console.log('🔍 Researching ServiceNow IP Network Table');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Step 1: Try to query the cmdb_ci_ip_network table
  console.log('Step 1: Checking if cmdb_ci_ip_network table exists');
  console.log('─'.repeat(70));

  const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_limit=1&sysparm_display_value=all`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  console.log(`Response Status: ${response.status} ${response.statusText}`);
  console.log('');

  if (!response.ok) {
    console.log('❌ Table does not exist or access denied');
    console.log('');
    console.log('Trying alternative table: cmdb_ci_netblock');
    console.log('─'.repeat(70));

    const altUrl = `${instanceUrl}/api/now/table/cmdb_ci_netblock?sysparm_limit=1&sysparm_display_value=all`;
    const altResponse = await fetch(altUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Response Status: ${altResponse.status} ${altResponse.statusText}`);
    console.log('');

    if (!altResponse.ok) {
      console.log('❌ Alternative table also not accessible');
      console.log('');
      console.log('Will need to use generic cmdb_ci table or create custom table');
      return;
    }

    const altData = await altResponse.json();
    console.log(`✅ Found cmdb_ci_netblock table with ${altData.result?.length || 0} sample records`);
    console.log('');

    if (altData.result && altData.result.length > 0) {
      console.log('Sample Record Fields:');
      console.log(JSON.stringify(altData.result[0], null, 2));
    }

    return;
  }

  const data = await response.json();
  console.log(`✅ Found cmdb_ci_ip_network table with ${data.result?.length || 0} sample records`);
  console.log('');

  if (data.result && data.result.length > 0) {
    console.log('Sample Record Fields:');
    const sample = data.result[0];

    // Show all field names
    console.log('');
    console.log('Available Fields:');
    for (const key of Object.keys(sample)) {
      const value = sample[key];
      const displayValue = typeof value === 'object' && value !== null
        ? (value.display_value || value.value || JSON.stringify(value))
        : value;

      if (displayValue && String(displayValue).trim()) {
        console.log(`  ${key}: ${String(displayValue).substring(0, 100)}`);
      } else {
        console.log(`  ${key}: (empty)`);
      }
    }
  } else {
    console.log('No existing IP network records found.');
    console.log('Will create new records.');
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('RECOMMENDATION');
  console.log('─'.repeat(70));
  console.log('');
  console.log('Use table: cmdb_ci_ip_network');
  console.log('Key fields for network import:');
  console.log('  - name: Network name (e.g., "Altus - Pearland Network")');
  console.log('  - network_address: CIDR notation (e.g., "10.246.5.0/24")');
  console.log('  - location: Link to cmn_location');
  console.log('  - company: Link to customer_account');
  console.log('  - dns_domain: Domain suffix');
  console.log('  - short_description: Brief description');
  console.log('  - comments: Additional details (DNS servers, etc.)');
  console.log('');
}

researchIPNetworkTable()
  .catch(console.error)
  .finally(() => process.exit(0));
