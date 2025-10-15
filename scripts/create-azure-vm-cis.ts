/**
 * Create Azure VM CIs
 * Creates VM CIs with IP addresses from discovered Azure data.
 * Usage: npx tsx scripts/create-azure-vm-cis.ts backup/azure-discovery/exceptional-vms.json
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function createVMCIs(discoveryFilePath: string) {
  console.log('💻 Creating Azure VM CIs');
  console.log('='.repeat(70));
  console.log('');

  if (!fs.existsSync(discoveryFilePath)) {
    console.error(`❌ Discovery file not found: ${discoveryFilePath}`);
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(discoveryFilePath, 'utf-8'));
  const vms = discovery.vms || [];

  console.log(`Tenant: ${discovery.tenant.name}`);
  console.log(`VMs: ${vms.length}`);
  console.log('');

  if (vms.length === 0) {
    console.log('⚠️  No VMs to create');
    process.exit(0);
  }

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

  let created = 0, existing = 0, errors = 0;

  for (const vm of vms) {
    console.log(`${vm.name}`);

    // Check existing
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host?sysparm_query=name=${encodeURIComponent(vm.name)}&sysparm_limit=1`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    if (checkResp.ok) {
      const checkData = await checkResp.json();
      if (checkData.result?.length > 0) {
        console.log(`  ⏭️  Exists`);
        existing++;
        continue;
      }
    }

    // Build description with IPs
    const ipInfo = [];
    if (vm.privateIpAddresses?.length > 0) {
      ipInfo.push(`Private IPs: ${vm.privateIpAddresses.join(', ')}`);
    }
    if (vm.publicIpAddresses?.length > 0) {
      ipInfo.push(`Public IPs: ${vm.publicIpAddresses.join(', ')}`);
    }

    const description = `Azure VM: ${vm.name}. Resource Group: ${vm.resourceGroup}. ${ipInfo.join('. ')}. Size: ${vm.vmSize}. OS: ${vm.osType}`;

    // Create CI
    const payload = {
      name: vm.name,
      ip_address: vm.privateIpAddresses?.[0] || '',
      location: vm.location,
      os: vm.osType,
      short_description: description,
      operational_status: vm.powerState?.includes('running') ? '1' : '2',
      install_status: '1'
    };

    const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host`;
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (createResp.ok) {
      console.log(`  ✅ Created (IP: ${vm.privateIpAddresses?.[0] || 'none'})`);
      created++;
    } else {
      console.log(`  ❌ Failed`);
      errors++;
    }
  }

  console.log('');
  console.log(`✅ Created: ${created}, ⏭️  Existing: ${existing}, ❌ Errors: ${errors}`);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx scripts/create-azure-vm-cis.ts <discovery-file.json>');
  process.exit(1);
}

createVMCIs(filePath).catch(console.error);
