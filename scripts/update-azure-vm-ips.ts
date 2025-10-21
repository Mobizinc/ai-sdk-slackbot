/**
 * Update Azure VM CIs with IP Addresses
 * Updates existing VM CIs with correct IP addresses from discovery data.
 * Usage: npx tsx scripts/update-azure-vm-ips.ts backup/azure-discovery/exceptional-emergency-center-vms.json
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function updateVMIPs(discoveryFilePath: string) {
  console.log('🔄 Updating Azure VM CIs with IP Addresses');
  console.log('='.repeat(70));
  console.log('');

  if (!fs.existsSync(discoveryFilePath)) {
    console.error(`❌ Discovery file not found: ${discoveryFilePath}`);
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(discoveryFilePath, 'utf-8'));
  const vms = discovery.vms || [];

  console.log(`Tenant: ${discovery.tenant.name}`);
  console.log(`VMs to update: ${vms.length}`);
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  let updated = 0, notFound = 0, noChange = 0, errors = 0;

  for (const vm of vms) {
    console.log(`${vm.name}`);

    // Find existing VM CI
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host?sysparm_query=name=${encodeURIComponent(vm.name)}&sysparm_limit=1&sysparm_fields=sys_id,ip_address,short_description`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    if (!checkResp.ok) {
      console.log(`  ❌ Error querying VM`);
      errors++;
      continue;
    }

    const checkData = await checkResp.json();
    if (!checkData.result || checkData.result.length === 0) {
      console.log(`  ⚠️  VM CI not found`);
      notFound++;
      continue;
    }

    const vmCI = checkData.result[0];
    const sysId = vmCI.sys_id;

    // Build new IP info
    const primaryIP = vm.privateIpAddresses?.[0] || '';

    const ipInfo = [];
    if (vm.privateIpAddresses?.length > 0) {
      ipInfo.push(`Private IPs: ${vm.privateIpAddresses.join(', ')}`);
    }
    if (vm.publicIpAddresses?.length > 0) {
      ipInfo.push(`Public IPs: ${vm.publicIpAddresses.join(', ')}`);
    }

    const newDescription = `Azure VM: ${vm.name}. Resource Group: ${vm.resourceGroup}. ${ipInfo.join('. ')}. Size: ${vm.vmSize}. OS: ${vm.osType}`;

    // Check if update needed
    const currentIP = vmCI.ip_address;
    if (currentIP === primaryIP && vmCI.short_description?.includes(primaryIP)) {
      console.log(`  ⏭️  Already up to date (IP: ${primaryIP})`);
      noChange++;
      continue;
    }

    // Update VM CI
    const updatePayload: any = {
      short_description: newDescription
    };

    if (primaryIP) {
      updatePayload.ip_address = primaryIP;
    }

    const updateUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host/${sysId}`;
    const updateResp = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });

    if (updateResp.ok) {
      console.log(`  ✅ Updated (IP: ${primaryIP || 'none'})`);
      if (vm.publicIpAddresses?.length > 0) {
        console.log(`     Public: ${vm.publicIpAddresses.join(', ')}`);
      }
      updated++;
    } else {
      console.log(`  ❌ Update failed`);
      errors++;
    }
  }

  console.log('');
  console.log(`✅ Updated: ${updated}, ⏭️  No Change: ${noChange}, ⚠️  Not Found: ${notFound}, ❌ Errors: ${errors}`);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx scripts/update-azure-vm-ips.ts <discovery-file.json>');
  process.exit(1);
}

updateVMIPs(filePath).catch(console.error);
