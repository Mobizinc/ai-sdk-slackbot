/**
 * Check Available Fields on cmdb_ci_ip_firewall Table
 *
 * Queries the ServiceNow Table API to get the schema for IP Firewall CIs
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function checkFirewallCIFields() {
  console.log('🔍 Checking cmdb_ci_ip_firewall Table Fields');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // Get one existing firewall to see all available fields
    console.log('📋 Fetching existing firewall CI to examine fields...');
    console.log('');

    const query = encodeURIComponent('nameLIKEAltus^sys_class_name=cmdb_ci_ip_firewall');
    const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_limit=1&sysparm_display_value=all`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query: ${response.status}`);
    }

    const data = await response.json();
    const firewalls = data.result || [];

    if (firewalls.length === 0) {
      console.log('⚠️  No existing Altus firewalls found in cmdb_ci_ip_firewall');
      console.log('');
      return;
    }

    const firewall = firewalls[0];
    const fields = Object.keys(firewall);

    console.log(`Found: ${firewall.name?.display_value || firewall.name}`);
    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 ALL AVAILABLE FIELDS:');
    console.log('─'.repeat(70));
    console.log('');

    // Group fields by category
    const managementFields = fields.filter(f =>
      f.includes('ip') ||
      f.includes('address') ||
      f.includes('port') ||
      f.includes('url') ||
      f.includes('management') ||
      f.includes('ssh') ||
      f.includes('web') ||
      f.includes('interface') ||
      f.includes('gateway') ||
      f.includes('dns') ||
      f.includes('fqdn') ||
      f.includes('mac')
    );

    const customFields = fields.filter(f => f.startsWith('u_'));

    const coreFields = [
      'name', 'sys_id', 'sys_class_name', 'serial_number', 'asset_tag',
      'manufacturer', 'model_id', 'firmware_version', 'location',
      'support_group', 'managed_by', 'company', 'operational_status',
      'install_status', 'warranty_expiration', 'comments', 'short_description'
    ];

    console.log('🔧 CORE FIELDS:');
    for (const field of coreFields) {
      if (fields.includes(field)) {
        const value = firewall[field];
        const displayValue = typeof value === 'object' ? value.display_value : value;
        console.log(`  ✅ ${field}: ${displayValue || '(empty)'}`);
      } else {
        console.log(`  ❌ ${field}: NOT AVAILABLE`);
      }
    }
    console.log('');

    console.log('🌐 NETWORK/MANAGEMENT FIELDS:');
    for (const field of managementFields) {
      const value = firewall[field];
      const displayValue = typeof value === 'object' ? value.display_value : value;
      console.log(`  ✅ ${field}: ${displayValue || '(empty)'}`);
    }
    console.log('');

    if (customFields.length > 0) {
      console.log('⚙️  CUSTOM FIELDS (u_*):');
      for (const field of customFields) {
        const value = firewall[field];
        const displayValue = typeof value === 'object' ? value.display_value : value;
        console.log(`  ✅ ${field}: ${displayValue || '(empty)'}`);
      }
      console.log('');
    } else {
      console.log('⚙️  CUSTOM FIELDS: None found');
      console.log('');
    }

    console.log('─'.repeat(70));
    console.log('📝 FIELD COUNT SUMMARY:');
    console.log('─'.repeat(70));
    console.log('');
    console.log(`Total fields: ${fields.length}`);
    console.log(`Network/Management fields: ${managementFields.length}`);
    console.log(`Custom fields: ${customFields.length}`);
    console.log('');

    // Show all fields for reference
    console.log('─'.repeat(70));
    console.log('📋 COMPLETE FIELD LIST:');
    console.log('─'.repeat(70));
    console.log('');
    fields.sort().forEach(f => console.log(`  - ${f}`));
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkFirewallCIFields()
  .catch(console.error)
  .finally(() => process.exit(0));
