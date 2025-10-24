/**
 * Extract ServiceNow Reference Data (READ-ONLY)
 *
 * Comprehensive extraction of all reference data needed for firewall enrichment:
 * - Customer Accounts (Altus parent and child brands)
 * - Locations (all cmdb_location records)
 * - Support Groups (sys_user_group)
 * - ALL Network Devices (cmdb_ci_netgear - not filtered by "Altus")
 *
 * This script is READ-ONLY and makes no modifications.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL: Production instance URL
 * - SERVICENOW_USERNAME: Production API username
 * - SERVICENOW_PASSWORD: Production API password
 *
 * Target: PRODUCTION (where the firewalls exist)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function extractServiceNowReferenceData() {
  console.log('📦 Extract ServiceNow Reference Data (PROD)');
  console.log('='.repeat(70));
  console.log('');

  // Get PROD credentials
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD ServiceNow credentials not configured');
    console.log('\\nRequired variables:');
    console.log('  - SERVICENOW_URL');
    console.log('  - SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Environment: PRODUCTION`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Create output directory
  const outputDir = path.join(process.cwd(), 'backup', 'servicenow-reference-data');
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // ========================================
    // 1. Customer Accounts
    // ========================================
    console.log('1. Extracting Customer Accounts');
    console.log('─'.repeat(70));

    // Query for Altus and related accounts
    const customerQuery = encodeURIComponent(
      'nameLIKEAltus^ORnameLIKENeighbors^ORnameLIKEExceptional^ORnumberLIKEACCT'
    );
    const customerUrl = `${instanceUrl}/api/now/table/customer_account?sysparm_query=${customerQuery}&sysparm_display_value=all&sysparm_limit=100`;

    const customerResponse = await fetch(customerUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!customerResponse.ok) {
      throw new Error(`Failed to query customer_account: ${customerResponse.status}`);
    }

    const customerData = await customerResponse.json();
    const customers = customerData.result || [];

    console.log(`Found ${customers.length} customer account(s)`);
    console.log('');

    for (const customer of customers) {
      const name = typeof customer.name === 'object' ? customer.name.display_value : customer.name;
      const number = typeof customer.number === 'object' ? customer.number.display_value : customer.number;
      const sysId = typeof customer.sys_id === 'object' ? customer.sys_id.value : customer.sys_id;
      const parent = typeof customer.parent === 'object' ? customer.parent.display_value : customer.parent;

      console.log(`  ${name}`);
      console.log(`    Number: ${number}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    Parent: ${parent || 'None'}`);
      console.log('');
    }

    // Save to file
    const customerPath = path.join(outputDir, 'customer_accounts.json');
    fs.writeFileSync(customerPath, JSON.stringify(customers, null, 2));
    console.log(`✅ Saved to: ${customerPath}`);
    console.log('');

    // ========================================
    // 2. Locations
    // ========================================
    console.log('2. Extracting Locations');
    console.log('─'.repeat(70));

    // Use cmn_location (the correct ServiceNow location table)
    const locationUrl = `${instanceUrl}/api/now/table/cmn_location?sysparm_display_value=all&sysparm_limit=500`;

    const locationResponse = await fetch(locationUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!locationResponse.ok) {
      throw new Error(`Failed to query cmn_location: ${locationResponse.status}`);
    }

    const locationData = await locationResponse.json();
    const locations = locationData.result || [];

    console.log(`Found ${locations.length} location(s)`);
    console.log('');

    // Show sample locations
    for (const location of locations.slice(0, 10)) {
      const name = typeof location.name === 'object' ? location.name.display_value : location.name;
      const sysId = typeof location.sys_id === 'object' ? location.sys_id.value : location.sys_id;
      const city = typeof location.city === 'object' ? location.city.display_value : location.city;
      const state = typeof location.state === 'object' ? location.state.display_value : location.state;

      console.log(`  ${name}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    City: ${city || 'N/A'}, State: ${state || 'N/A'}`);
      console.log('');
    }

    if (locations.length > 10) {
      console.log(`  ... and ${locations.length - 10} more`);
      console.log('');
    }

    // Save to file
    const locationPath = path.join(outputDir, 'locations.json');
    fs.writeFileSync(locationPath, JSON.stringify(locations, null, 2));
    console.log(`✅ Saved to: ${locationPath}`);
    console.log('');

    // ========================================
    // 3. Support Groups
    // ========================================
    console.log('3. Extracting Support Groups');
    console.log('─'.repeat(70));

    const groupUrl = `${instanceUrl}/api/now/table/sys_user_group?sysparm_display_value=all&sysparm_limit=100`;

    const groupResponse = await fetch(groupUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!groupResponse.ok) {
      throw new Error(`Failed to query sys_user_group: ${groupResponse.status}`);
    }

    const groupData = await groupResponse.json();
    const groups = groupData.result || [];

    console.log(`Found ${groups.length} support group(s)`);
    console.log('');

    // Show groups with "network", "infrastructure", or "IT" in name
    const relevantGroups = groups.filter((g: any) => {
      const name = typeof g.name === 'object' ? g.name.display_value : g.name;
      const nameLower = (name || '').toLowerCase();
      return nameLower.includes('network') ||
             nameLower.includes('infrastructure') ||
             nameLower.includes('it ') ||
             nameLower.includes('support');
    });

    console.log(`Relevant groups (network/infrastructure/IT): ${relevantGroups.length}`);
    console.log('');

    for (const group of relevantGroups.slice(0, 20)) {
      const name = typeof group.name === 'object' ? group.name.display_value : group.name;
      const sysId = typeof group.sys_id === 'object' ? group.sys_id.value : group.sys_id;
      const type = typeof group.type === 'object' ? group.type.display_value : group.type;

      console.log(`  ${name}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    Type: ${type || 'N/A'}`);
      console.log('');
    }

    // Save to file
    const groupPath = path.join(outputDir, 'support_groups.json');
    fs.writeFileSync(groupPath, JSON.stringify(groups, null, 2));
    console.log(`✅ Saved to: ${groupPath}`);
    console.log('');

    // ========================================
    // 4. ALL Network Devices (not filtered)
    // ========================================
    console.log('4. Extracting ALL Network Devices (cmdb_ci_netgear)');
    console.log('─'.repeat(70));

    // Query ALL network devices (no name filter)
    const netgearUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear?sysparm_display_value=all&sysparm_limit=1000`;

    const netgearResponse = await fetch(netgearUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!netgearResponse.ok) {
      throw new Error(`Failed to query cmdb_ci_netgear: ${netgearResponse.status}`);
    }

    const netgearData = await netgearResponse.json();
    const allDevices = netgearData.result || [];

    console.log(`Found ${allDevices.length} total network device(s)`);
    console.log('');

    // Filter for Altus-related devices
    const altusDevices = allDevices.filter((d: any) => {
      const name = typeof d.name === 'object' ? d.name.display_value : d.name;
      const company = typeof d.company === 'object' ? d.company.display_value : d.company;
      const nameLower = (name || '').toLowerCase();
      const companyLower = (company || '').toLowerCase();

      return nameLower.includes('altus') ||
             companyLower.includes('altus') ||
             companyLower.includes('neighbors') ||
             companyLower.includes('exceptional');
    });

    console.log(`Altus-related devices: ${altusDevices.length}`);
    console.log('');

    for (const device of altusDevices.slice(0, 20)) {
      const name = typeof device.name === 'object' ? device.name.display_value : device.name;
      const sysId = typeof device.sys_id === 'object' ? device.sys_id.value : device.sys_id;
      const company = typeof device.company === 'object' ? device.company.display_value : device.company;
      const serial = typeof device.serial_number === 'object' ? device.serial_number.display_value : device.serial_number;

      console.log(`  ${name}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    Company: ${company || 'None'}`);
      console.log(`    Serial: ${serial || 'None'}`);
      console.log('');
    }

    // Save ALL devices to file
    const allDevicesPath = path.join(outputDir, 'all_network_devices.json');
    fs.writeFileSync(allDevicesPath, JSON.stringify(allDevices, null, 2));
    console.log(`✅ Saved all devices to: ${allDevicesPath}`);
    console.log('');

    // Save Altus-related devices to separate file
    const altusDevicesPath = path.join(outputDir, 'altus_network_devices.json');
    fs.writeFileSync(altusDevicesPath, JSON.stringify(altusDevices, null, 2));
    console.log(`✅ Saved Altus devices to: ${altusDevicesPath}`);
    console.log('');

    // ========================================
    // Summary
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 EXTRACTION SUMMARY');
    console.log('─'.repeat(70));
    console.log('');

    console.log(`Customer Accounts: ${customers.length}`);
    console.log(`Locations: ${locations.length}`);
    console.log(`Support Groups: ${groups.length} (${relevantGroups.length} relevant)`);
    console.log(`Network Devices (Total): ${allDevices.length}`);
    console.log(`Network Devices (Altus-related): ${altusDevices.length}`);
    console.log('');

    console.log('Output Directory:', outputDir);
    console.log('');

    console.log('Files Created:');
    console.log('  - customer_accounts.json');
    console.log('  - locations.json');
    console.log('  - support_groups.json');
    console.log('  - all_network_devices.json');
    console.log('  - altus_network_devices.json');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Extraction failed:');
    console.error(error);
    process.exit(1);
  }
}

extractServiceNowReferenceData()
  .catch(console.error)
  .finally(() => process.exit(0));
