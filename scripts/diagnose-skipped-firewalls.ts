/**
 * Diagnose Skipped Firewalls
 *
 * Debug script to see what's happening with PROD firewall queries
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function diagnoseSkippedFirewalls() {
  console.log('🔍 Diagnosing Skipped Firewalls in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  console.log('Environment:');
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log('');

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Test with just one firewall first
  const testName = 'Altus - Pearland';

  console.log(`Testing query for: ${testName}`);
  console.log('');

  const query = encodeURIComponent(`name=${testName}`);
  const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=5`;

  console.log('Query URL:');
  console.log(`  ${url}`);
  console.log('');

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  console.log(`Response Status: ${response.status} ${response.statusText}`);
  console.log('');

  if (response.ok) {
    const data = await response.json();
    console.log(`Results found: ${data.result?.length || 0}`);
    console.log('');

    if (data.result && data.result.length > 0) {
      console.log('First result:');
      const fw = data.result[0];
      console.log(`  sys_id: ${fw.sys_id?.value || fw.sys_id}`);
      console.log(`  name: ${fw.name?.display_value || fw.name}`);
      console.log(`  manufacturer: ${fw.manufacturer?.display_value || fw.manufacturer}`);
      console.log(`  model_id: ${fw.model_id?.display_value || fw.model_id}`);
      console.log(`  firmware_version: ${fw.firmware_version?.display_value || fw.firmware_version || '(empty)'}`);
      console.log(`  comments: ${fw.comments?.display_value ? '(has content)' : '(empty)'}`);
      console.log(`  physical_interface_count: ${fw.physical_interface_count?.display_value || fw.physical_interface_count || '(empty)'}`);
      console.log(`  warranty_expiration: ${fw.warranty_expiration?.display_value || fw.warranty_expiration || '(empty)'}`);
      console.log(`  support_group: ${fw.support_group?.display_value || '(empty)'}`);
      console.log('');
    } else {
      console.log('❌ No results found');
      console.log('');

      // Try a broader query
      console.log('Trying broader query (all firewalls for Altus)...');
      const broadQuery = encodeURIComponent('nameLIKEAltus');
      const broadUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${broadQuery}&sysparm_limit=30`;

      const broadResponse = await fetch(broadUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (broadResponse.ok) {
        const broadData = await broadResponse.json();
        console.log(`  Found ${broadData.result?.length || 0} Altus firewalls total`);
        console.log('');

        if (broadData.result && broadData.result.length > 0) {
          console.log('  First 10 firewall names:');
          for (let i = 0; i < Math.min(10, broadData.result.length); i++) {
            const name = broadData.result[i].name?.display_value || broadData.result[i].name;
            console.log(`    ${i + 1}. ${name}`);
          }
        }
      }
    }
  } else {
    const errorText = await response.text();
    console.error('❌ Query failed:');
    console.error(`  ${errorText}`);
  }

  console.log('');
}

diagnoseSkippedFirewalls()
  .catch(console.error)
  .finally(() => process.exit(0));
