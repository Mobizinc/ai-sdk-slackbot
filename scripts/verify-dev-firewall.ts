/**
 * Verify a Firewall Record in DEV
 *
 * Fetches a specific firewall from DEV to verify all fields were populated correctly
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function verifyDevFirewall() {
  console.log('🔍 Verify Firewall in DEV ServiceNow');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.DEV_SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ DEV ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Query for Altus - Pearland (the first one we created)
  const firewallName = 'Altus - Pearland';
  const query = encodeURIComponent(`name=${firewallName}`);
  const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=1`;

  try {
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

    if (!data.result || data.result.length === 0) {
      console.log(`❌ Firewall not found: ${firewallName}`);
      process.exit(1);
    }

    const firewall = data.result[0];

    console.log(`✅ Found: ${firewallName}`);
    console.log('');
    console.log('─'.repeat(70));
    console.log('FIELD VERIFICATION:');
    console.log('─'.repeat(70));
    console.log('');

    const fieldsToCheck = [
      'sys_id',
      'name',
      'sys_class_name',
      'ip_address',
      'serial_number',
      'asset_tag',
      'manufacturer',
      'model_id',
      'firmware_version',
      'location',
      'support_group',
      'managed_by',
      'company',
      'operational_status',
      'install_status',
      'comments',
      'short_description',
      'ports',
      'physical_interface_count',
      'warranty_expiration',
    ];

    for (const field of fieldsToCheck) {
      const value = firewall[field];
      let displayValue = typeof value === 'object' ? (value.display_value || '(empty)') : (value || '(empty)');

      // Truncate long values
      if (typeof displayValue === 'string' && displayValue.length > 80) {
        displayValue = displayValue.substring(0, 77) + '...';
      }

      const status = displayValue === '(empty)' ? '⚠️ ' : '✅';
      console.log(`${status} ${field}: ${displayValue}`);
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('FULL COMMENTS FIELD:');
    console.log('─'.repeat(70));
    console.log('');
    const comments = firewall.comments;
    const commentsValue = typeof comments === 'object' ? comments.display_value : comments;
    console.log(commentsValue || '(empty)');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyDevFirewall()
  .catch(console.error)
  .finally(() => process.exit(0));
