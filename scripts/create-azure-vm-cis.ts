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

async function createVMCIs(discoveryFilePath: string, companySysId?: string) {
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

  if (companySysId) {
    console.log(`Company sys_id will be set to: ${companySysId}`);
    console.log('');
  } else {
    console.warn('⚠️  No --company sys_id provided. VM CIs will not have company ownership set.');
    console.log('');
  }

  let created = 0, existing = 0, errors = 0, linked = 0;

  for (const vm of vms) {
    console.log(`${vm.name}`);

    // Find parent resource group CI
    const resourceGroupUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_query=name=${encodeURIComponent(vm.resourceGroup)}&sysparm_limit=1&sysparm_fields=sys_id,name`;
    const resourceGroupResp = await fetch(resourceGroupUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    let parentResourceGroupSysId: string | null = null;
    if (resourceGroupResp.ok) {
      const resourceGroupData = await resourceGroupResp.json();
      if (resourceGroupData.result?.length > 0) {
        parentResourceGroupSysId = resourceGroupData.result[0].sys_id;
        console.log(`  📎 Parent resource group: ${resourceGroupData.result[0].name}`);
      }
    }

    if (!parentResourceGroupSysId) {
      console.log(`  ⚠️  Parent resource group not found: ${vm.resourceGroup}`);
      errors++;
      continue;
    }

    // Check existing
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host?sysparm_query=name=${encodeURIComponent(vm.name)}&sysparm_limit=1&sysparm_fields=sys_id,company`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    let vmSysId: string | null = null;

    if (checkResp.ok) {
      const checkData = await checkResp.json();
      if (checkData.result?.length > 0) {
        console.log(`  ⏭️  Exists`);
        vmSysId = checkData.result[0].sys_id;
        existing++;

        if (companySysId) {
          const existingCompany = checkData.result[0].company?.value || checkData.result[0].company;
          if (!existingCompany || existingCompany !== companySysId) {
            await fetch(`${instanceUrl}/api/now/table/cmdb_ci_cloud_host/${vmSysId}`, {
              method: 'PATCH',
              headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
              body: JSON.stringify({ company: companySysId }),
            }).then(resp => {
              if (resp.ok) {
                console.log('  🏷️  Updated company linkage on existing CI');
              } else {
                console.warn('  ⚠️  Failed to update company on existing CI');
              }
            });
          }
        }
      }
    }

    // Create CI if doesn't exist
    if (!vmSysId) {
      // Build description with IPs
      const ipInfo = [];
      if (vm.privateIpAddresses?.length > 0) {
        ipInfo.push(`Private IPs: ${vm.privateIpAddresses.join(', ')}`);
      }
      if (vm.publicIpAddresses?.length > 0) {
        ipInfo.push(`Public IPs: ${vm.publicIpAddresses.join(', ')}`);
      }

      const description = `Azure VM: ${vm.name}. Resource Group: ${vm.resourceGroup}. ${ipInfo.join('. ')}. Size: ${vm.vmSize}. OS: ${vm.osType}`;

      const payload: Record<string, unknown> = {
        name: vm.name,
        ip_address: vm.privateIpAddresses?.[0] || '',
        location: vm.location,
        os: vm.osType,
        short_description: description,
        operational_status: vm.powerState?.includes('running') ? '1' : '2',
        install_status: '1'
      };

      if (companySysId) {
        payload.company = companySysId;
      }

      const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host`;
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (createResp.ok) {
        const createData = await createResp.json();
        vmSysId = createData.result.sys_id;
        console.log(`  ✅ Created (IP: ${vm.privateIpAddresses?.[0] || 'none'})`);
        created++;
      } else {
        console.log(`  ❌ Failed to create`);
        errors++;
        continue;
      }
    }

    // Create CI relationship: Resource Group Contains VM
    const relCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${parentResourceGroupSysId}^child=${vmSysId}&sysparm_limit=1`;
    const relCheckResp = await fetch(relCheckUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    if (relCheckResp.ok) {
      const relCheckData = await relCheckResp.json();
      if (relCheckData.result?.length > 0) {
        console.log(`  🔗 Already linked to resource group`);
      } else {
        // Create relationship
        const relPayload = {
          parent: parentResourceGroupSysId,
          child: vmSysId,
          type: 'Contains::Contained by'
        };

        const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
        const relResp = await fetch(relUrl, {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(relPayload)
        });

        if (relResp.ok) {
          console.log(`  🔗 Linked to resource group`);
          linked++;
        } else {
          console.log(`  ❌ Failed to link`);
        }
      }
    }
  }

  console.log('');
  console.log(`✅ Created: ${created}, ⏭️  Existing: ${existing}, 🔗 Linked: ${linked}, ❌ Errors: ${errors}`);
}

const args = process.argv.slice(2);
const discoveryFilePath = args[0];
let companySysId: string | undefined;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--company' && args[i + 1]) {
    companySysId = args[i + 1];
    i += 1;
  }
}

if (!discoveryFilePath) {
  console.error('Usage: npx tsx scripts/create-azure-vm-cis.ts <discovery-file.json> [--company <sys_id>]');
  process.exit(1);
}

createVMCIs(discoveryFilePath, companySysId).catch(console.error);
