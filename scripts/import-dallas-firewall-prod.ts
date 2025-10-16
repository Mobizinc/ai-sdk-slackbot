/**
 * Import Dallas Datacenter Firewall to PROD
 *
 * Create the Dallas Datacenter firewall CI in ServiceNow PROD
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function importDallasFirewallProd() {
  console.log('🔥 Importing Dallas Datacenter Firewall to PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  console.log(`URL: ${instanceUrl}`);
  console.log('');
  console.log('⚠️  WARNING: Creating firewall in PRODUCTION');
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Dallas Datacenter firewall details
  const firewall = {
    name: 'Altus - Dallas Datacenter',
    ip_address: '10.101.1.1',
    location: 'bea762e2c3a56e50a01d5673e40131e6', // Dallas location sys_id
    manufacturer: 'Fortinet',
    model_id: 'FG-120G',
    company: 'c3eec28c931c9a1049d9764efaba10f3', // Altus Community Healthcare
    operational_status: '1', // Operational
    install_status: '1', // Installed
    comments: 'Web Management: https://66.18.1.18:4316 (external) | Datacenter firewall',
    short_description: 'Fortinet FG-120G firewall - Dallas Datacenter location',
    support_group: 'bccc73e7474ad91012702d12736d438c',
  };

  console.log('Creating Dallas Datacenter firewall:');
  console.log(`  Name: ${firewall.name}`);
  console.log(`  IP: ${firewall.ip_address}`);
  console.log(`  Model: ${firewall.manufacturer} ${firewall.model_id}`);
  console.log(`  Location: Dallas (${firewall.location})`);
  console.log('');

  try {
    const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firewall),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Failed: ${response.status} - ${errorText.substring(0, 300)}`);
      console.log('');
      process.exit(1);
    }

    const responseData = await response.json();
    const sysId = responseData.result.sys_id;

    console.log('✅ Dallas Datacenter firewall created successfully!');
    console.log(`   sys_id: ${sysId}`);
    console.log('');
    console.log('─'.repeat(70));
    console.log('SUMMARY');
    console.log('─'.repeat(70));
    console.log('✅ Dallas Datacenter firewall imported to PROD');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Create firewall-network relationship');
    console.log('  2. Verify all networks are linked to firewalls');
  } catch (error) {
    console.log(`❌ Error: ${error}`);
    process.exit(1);
  }
}

importDallasFirewallProd()
  .catch(console.error)
  .finally(() => process.exit(0));
