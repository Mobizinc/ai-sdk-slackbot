/**
 * List All PROD Firewalls
 *
 * Get complete list of all Altus firewalls in PROD
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function listAllProdFirewalls() {
  console.log('🔥 All Altus Firewalls in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const query = encodeURIComponent('nameLIKEAltus');
  const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=50`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Query failed:', errorText);
    process.exit(1);
  }

  const data = await response.json();
  const firewalls = data.result || [];

  console.log(`Found ${firewalls.length} Altus firewalls in PROD`);
  console.log('');
  console.log('─'.repeat(70));

  for (let i = 0; i < firewalls.length; i++) {
    const fw = firewalls[i];
    const name = fw.name?.display_value || fw.name;
    const sysId = fw.sys_id?.value || fw.sys_id;
    const serial = fw.serial_number?.display_value || fw.serial_number;
    const manufacturer = fw.manufacturer?.display_value || fw.manufacturer;
    const model = fw.model_id?.display_value || fw.model_id;
    const firmware = fw.firmware_version?.display_value || fw.firmware_version;
    const hasComments = fw.comments?.display_value || fw.comments;
    const interfaceCount = fw.physical_interface_count?.display_value || fw.physical_interface_count;
    const warranty = fw.warranty_expiration?.display_value || fw.warranty_expiration;
    const supportGroup = fw.support_group?.display_value || fw.support_group;

    console.log(`${i + 1}. ${name}`);
    console.log(`   sys_id: ${sysId}`);
    console.log(`   Serial: ${serial || '(empty)'}`);
    console.log(`   Manufacturer: ${manufacturer || '(empty)'}`);
    console.log(`   Model: ${model || '(empty)'}`);
    console.log(`   Firmware: ${firmware || '❌ MISSING'}`);
    console.log(`   Comments: ${hasComments ? '✅' : '❌ MISSING'}`);
    console.log(`   Interface Count: ${interfaceCount || '❌ MISSING'}`);
    console.log(`   Warranty: ${warranty || '❌ MISSING'}`);
    console.log(`   Support Group: ${supportGroup || '❌ MISSING'}`);
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total firewalls in PROD: ${firewalls.length}`);
  console.log('');

  // Count how many are missing each field
  let missingFirmware = 0;
  let missingComments = 0;
  let missingInterfaceCount = 0;
  let missingWarranty = 0;
  let missingSupportGroup = 0;

  for (const fw of firewalls) {
    if (!fw.firmware_version?.display_value && !fw.firmware_version) missingFirmware++;
    if (!fw.comments?.display_value && !fw.comments) missingComments++;
    if (!fw.physical_interface_count?.display_value && !fw.physical_interface_count) missingInterfaceCount++;
    if (!fw.warranty_expiration?.display_value && !fw.warranty_expiration) missingWarranty++;
    if (!fw.support_group?.display_value && !fw.support_group) missingSupportGroup++;
  }

  console.log('Missing Fields:');
  console.log(`  Firmware: ${missingFirmware}/${firewalls.length}`);
  console.log(`  Comments: ${missingComments}/${firewalls.length}`);
  console.log(`  Interface Count: ${missingInterfaceCount}/${firewalls.length}`);
  console.log(`  Warranty: ${missingWarranty}/${firewalls.length}`);
  console.log(`  Support Group: ${missingSupportGroup}/${firewalls.length}`);
  console.log('');
}

listAllProdFirewalls()
  .catch(console.error)
  .finally(() => process.exit(0));
