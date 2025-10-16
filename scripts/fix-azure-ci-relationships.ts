/**
 * Fix Azure CI Relationships
 * Links existing Azure CIs in the correct hierarchy:
 *   Subscription → Contains → Resource Group → Contains → VM
 *
 * Usage: npx tsx scripts/fix-azure-ci-relationships.ts backup/azure-discovery/exceptional-emergency-center-resource-groups.json backup/azure-discovery/exceptional-emergency-center-vms.json
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function fixAzureCIRelationships(rgFilePath: string, vmFilePath: string) {
  console.log('🔗 Fixing Azure CI Relationships');
  console.log('='.repeat(70));
  console.log('');

  // Validate files
  if (!fs.existsSync(rgFilePath)) {
    console.error(`❌ Resource groups file not found: ${rgFilePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(vmFilePath)) {
    console.error(`❌ VMs file not found: ${vmFilePath}`);
    process.exit(1);
  }

  const rgDiscovery = JSON.parse(fs.readFileSync(rgFilePath, 'utf-8'));
  const vmDiscovery = JSON.parse(fs.readFileSync(vmFilePath, 'utf-8'));

  const resourceGroups = rgDiscovery.resource_groups || [];
  const vms = vmDiscovery.vms || [];

  console.log(`Tenant: ${rgDiscovery.tenant.name}`);
  console.log(`Resource Groups: ${resourceGroups.length}`);
  console.log(`VMs: ${vms.length}`);
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

  // Phase 1: Link Resource Groups to Subscriptions
  console.log('━'.repeat(70));
  console.log('Phase 1: Linking Resource Groups to Subscriptions');
  console.log('━'.repeat(70));
  console.log('');

  let rgLinked = 0, rgAlreadyLinked = 0, rgErrors = 0;

  for (const rg of resourceGroups) {
    console.log(`${rg.name}`);

    // Find parent subscription CI
    const subscriptionUrl = `${instanceUrl}/api/now/table/cmdb_ci_azure_subscription?sysparm_query=correlation_id=${encodeURIComponent(rg.subscriptionId)}&sysparm_limit=1&sysparm_fields=sys_id,name`;
    const subscriptionResp = await fetch(subscriptionUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    let parentSubscriptionSysId: string | null = null;
    if (subscriptionResp.ok) {
      const subscriptionData = await subscriptionResp.json();
      if (subscriptionData.result?.length > 0) {
        parentSubscriptionSysId = subscriptionData.result[0].sys_id;
        console.log(`  📎 Subscription: ${subscriptionData.result[0].name}`);
      }
    }

    if (!parentSubscriptionSysId) {
      console.log(`  ⚠️  Subscription CI not found for ID: ${rg.subscriptionId}`);
      rgErrors++;
      continue;
    }

    // Find resource group CI
    const rgUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_query=name=${encodeURIComponent(rg.name)}&sysparm_limit=1&sysparm_fields=sys_id`;
    const rgResp = await fetch(rgUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    let resourceGroupSysId: string | null = null;
    if (rgResp.ok) {
      const rgData = await rgResp.json();
      if (rgData.result?.length > 0) {
        resourceGroupSysId = rgData.result[0].sys_id;
      }
    }

    if (!resourceGroupSysId) {
      console.log(`  ⚠️  Resource Group CI not found`);
      rgErrors++;
      continue;
    }

    // Check if relationship already exists
    const relCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${parentSubscriptionSysId}^child=${resourceGroupSysId}&sysparm_limit=1`;
    const relCheckResp = await fetch(relCheckUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    if (relCheckResp.ok) {
      const relCheckData = await relCheckResp.json();
      if (relCheckData.result?.length > 0) {
        console.log(`  ⏭️  Already linked`);
        rgAlreadyLinked++;
        continue;
      }
    }

    // Create relationship
    const relPayload = {
      parent: parentSubscriptionSysId,
      child: resourceGroupSysId,
      type: 'Contains::Contained by'
    };

    const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
    const relResp = await fetch(relUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(relPayload)
    });

    if (relResp.ok) {
      console.log(`  ✅ Linked`);
      rgLinked++;
    } else {
      console.log(`  ❌ Failed to link`);
      rgErrors++;
    }
  }

  console.log('');
  console.log(`Resource Groups: ✅ Linked: ${rgLinked}, ⏭️  Already Linked: ${rgAlreadyLinked}, ❌ Errors: ${rgErrors}`);
  console.log('');

  // Phase 2: Link VMs to Resource Groups
  console.log('━'.repeat(70));
  console.log('Phase 2: Linking VMs to Resource Groups');
  console.log('━'.repeat(70));
  console.log('');

  let vmLinked = 0, vmAlreadyLinked = 0, vmErrors = 0;

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
        console.log(`  📎 Resource Group: ${resourceGroupData.result[0].name}`);
      }
    }

    if (!parentResourceGroupSysId) {
      console.log(`  ⚠️  Resource Group CI not found: ${vm.resourceGroup}`);
      vmErrors++;
      continue;
    }

    // Find VM CI
    const vmUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host?sysparm_query=name=${encodeURIComponent(vm.name)}&sysparm_limit=1&sysparm_fields=sys_id`;
    const vmResp = await fetch(vmUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    let vmSysId: string | null = null;
    if (vmResp.ok) {
      const vmData = await vmResp.json();
      if (vmData.result?.length > 0) {
        vmSysId = vmData.result[0].sys_id;
      }
    }

    if (!vmSysId) {
      console.log(`  ⚠️  VM CI not found`);
      vmErrors++;
      continue;
    }

    // Check if relationship already exists
    const relCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${parentResourceGroupSysId}^child=${vmSysId}&sysparm_limit=1`;
    const relCheckResp = await fetch(relCheckUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    if (relCheckResp.ok) {
      const relCheckData = await relCheckResp.json();
      if (relCheckData.result?.length > 0) {
        console.log(`  ⏭️  Already linked`);
        vmAlreadyLinked++;
        continue;
      }
    }

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
      console.log(`  ✅ Linked`);
      vmLinked++;
    } else {
      console.log(`  ❌ Failed to link`);
      vmErrors++;
    }
  }

  console.log('');
  console.log(`VMs: ✅ Linked: ${vmLinked}, ⏭️  Already Linked: ${vmAlreadyLinked}, ❌ Errors: ${vmErrors}`);
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('📊 Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Total Relationships Created: ${rgLinked + vmLinked}`);
  console.log(`  - Resource Groups → Subscriptions: ${rgLinked}`);
  console.log(`  - VMs → Resource Groups: ${vmLinked}`);
  console.log('');
  console.log(`Already Linked: ${rgAlreadyLinked + vmAlreadyLinked}`);
  console.log(`Errors: ${rgErrors + vmErrors}`);
  console.log('');

  if (rgLinked + vmLinked > 0) {
    console.log('✅ Azure CI hierarchy is now complete!');
    console.log('');
    console.log('View in ServiceNow:');
    console.log('  1. Navigate to: CMDB > Configuration > Azure Subscriptions');
    console.log('  2. Open any subscription');
    console.log('  3. Check "CI Relationships" tab');
    console.log('  4. Verify resource groups and VMs in hierarchy');
    console.log('');
  }
}

const rgFilePath = process.argv[2];
const vmFilePath = process.argv[3];

if (!rgFilePath || !vmFilePath) {
  console.error('Usage: npx tsx scripts/fix-azure-ci-relationships.ts <resource-groups.json> <vms.json>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/fix-azure-ci-relationships.ts \\');
  console.error('    backup/azure-discovery/exceptional-emergency-center-resource-groups.json \\');
  console.error('    backup/azure-discovery/exceptional-emergency-center-vms.json');
  process.exit(1);
}

fixAzureCIRelationships(rgFilePath, vmFilePath).catch(console.error);
