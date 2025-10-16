/**
 * Get IP Network Table Fields
 *
 * Query ServiceNow dictionary to get all available fields for cmdb_ci_ip_network
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function getIPNetworkFields() {
  console.log('🔍 Getting IP Network Table Fields');
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

  // Query sys_dictionary for cmdb_ci_ip_network table fields
  const query = encodeURIComponent('name=cmdb_ci_ip_network');
  const url = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=${query}&sysparm_fields=element,column_label,internal_type&sysparm_limit=100`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`❌ Failed to query dictionary: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();
  const fields = data.result || [];

  console.log(`Found ${fields.length} fields for cmdb_ci_ip_network`);
  console.log('');
  console.log('─'.repeat(70));
  console.log('RELEVANT FIELDS FOR NETWORK IMPORT:');
  console.log('─'.repeat(70));
  console.log('');

  // Filter and show relevant fields
  const relevantKeywords = ['name', 'network', 'address', 'cidr', 'subnet', 'mask', 'gateway', 'dns', 'domain', 'location', 'company', 'description', 'comment'];

  const relevantFields = fields.filter((field: any) => {
    const element = field.element?.toLowerCase() || '';
    return relevantKeywords.some(keyword => element.includes(keyword));
  });

  for (const field of relevantFields) {
    console.log(`${field.element}: ${field.column_label} (${field.internal_type})`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('ALL FIELDS:');
  console.log('─'.repeat(70));
  console.log('');

  for (const field of fields) {
    if (field.element) {
      console.log(`  ${field.element}: ${field.column_label || '(no label)'} (${field.internal_type})`);
    }
  }

  console.log('');
}

getIPNetworkFields()
  .catch(console.error)
  .finally(() => process.exit(0));
