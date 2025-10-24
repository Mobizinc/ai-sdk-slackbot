/**
 * Discover Azure VMs via CLI
 *
 * Uses Azure CLI to discover all VMs, resource groups, and IP addresses in a tenant.
 * Queries all subscriptions discovered in previous step.
 *
 * PREREQUISITES:
 * - Azure CLI installed and logged in
 * - Run discover-azure-subscriptions-cli.ts first
 *
 * USAGE:
 *   npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional
 *
 * OUTPUTS:
 * - backup/azure-discovery/<tenant-name>-vms.json
 * - backup/azure-discovery/<tenant-name>-vms.csv
 * - backup/azure-discovery/<tenant-name>-resource-groups.json
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execAsync = promisify(exec);

interface AzureVM {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  vmSize: string;
  osType: string;
  provisioningState: string;
  powerState?: string;
  privateIpAddresses: string[];
  publicIpAddresses: string[];
  tags: Record<string, string>;
}

interface ResourceGroup {
  id: string;
  name: string;
  location: string;
  tags: Record<string, string>;
  subscriptionId: string;
}

async function discoverAzureVMs(tenantKey: string) {
  console.log('☁️  Discover Azure VMs, Resource Groups, and IPs');
  console.log('='.repeat(70));
  console.log('');

  const discoveryDir = path.join(process.cwd(), 'backup', 'azure-discovery');

  // Try multiple naming patterns for subscription file
  const possibleNames = [
    `${tenantKey.toLowerCase().replace(/\s+/g, '-')}-subscriptions.json`,
    `exceptional-emergency-center-subscriptions.json`, // Fallback for exceptional
    `altus-community-healthcare-subscriptions.json`,
    `neighbors-health-subscriptions.json`,
    `austin-emergency-center-subscriptions.json`
  ];

  let subscriptionsPath = '';
  for (const name of possibleNames) {
    const testPath = path.join(discoveryDir, name);
    if (fs.existsSync(testPath)) {
      subscriptionsPath = testPath;
      break;
    }
  }

  if (!subscriptionsPath) {
    const tenantSlug = tenantKey.toLowerCase().replace(/\s+/g, '-');
    subscriptionsPath = path.join(discoveryDir, `${tenantSlug}-subscriptions.json`);
  }

  // Load discovered subscriptions
  if (!fs.existsSync(subscriptionsPath)) {
    console.error(`❌ Subscriptions not yet discovered`);
    console.error('');
    console.error('Run first:');
    console.error(`  npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant ${tenantKey}`);
    process.exit(1);
  }

  const subsData = JSON.parse(fs.readFileSync(subscriptionsPath, 'utf-8'));
  const tenant = subsData.tenant;
  const subscriptions = subsData.subscriptions;

  console.log(`Tenant: ${tenant.name}`);
  console.log(`Subscriptions: ${subscriptions.length}`);
  console.log('');

  const allVMs: AzureVM[] = [];
  const allResourceGroups: ResourceGroup[] = [];

  try {
    for (const sub of subscriptions) {
      console.log('─'.repeat(70));
      console.log(`Subscription: ${sub.subscription_name}`);
      console.log(`  ID: ${sub.subscription_id}`);
      console.log('─'.repeat(70));
      console.log('');

      // Discover resource groups
      console.log('  Discovering resource groups...');

      try {
        const rgCommand = `az group list --subscription ${sub.subscription_id} --output json`;
        const { stdout: rgStdout } = await execAsync(rgCommand);
        const resourceGroups = JSON.parse(rgStdout);

        console.log(`    ✅ Found ${resourceGroups.length} resource group(s)`);

        for (const rg of resourceGroups) {
          allResourceGroups.push({
            id: rg.id,
            name: rg.name,
            location: rg.location,
            tags: rg.tags || {},
            subscriptionId: sub.subscription_id
          });
        }
      } catch (error: any) {
        console.log(`    ⚠️  Error discovering resource groups: ${error.message}`);
      }

      console.log('');

      // Discover VMs
      console.log('  Discovering VMs...');

      try {
        const vmListCommand = `az vm list --subscription ${sub.subscription_id} --output json`;
        const { stdout: vmStdout } = await execAsync(vmListCommand);
        const vms = JSON.parse(vmStdout);

        if (vms.length === 0) {
          console.log(`    ⚠️  No VMs found in this subscription`);
          console.log('');
          continue;
        }

        console.log(`    ✅ Found ${vms.length} VM(s)`);
        console.log('');

        // Get IP addresses for all VMs
        console.log('  Discovering IP addresses...');

        const vmIpCommand = `az vm list-ip-addresses --subscription ${sub.subscription_id} --output json`;
        const { stdout: ipStdout } = await execAsync(vmIpCommand);
        const vmIpData = JSON.parse(ipStdout);

        // Create IP lookup map (aggregate IPs per VM)
        const ipMap = new Map<string, { private: string[]; public: string[] }>();

        for (const vmIp of vmIpData) {
          const vmName = vmIp.virtualMachine?.name;
          if (!vmName) continue;

          // Get or create entry for this VM
          if (!ipMap.has(vmName)) {
            ipMap.set(vmName, { private: [], public: [] });
          }
          const vmIps = ipMap.get(vmName)!;

          // Azure CLI new format: network.privateIpAddresses and network.publicIpAddresses
          const network = vmIp.virtualMachine?.network;

          if (network?.privateIpAddresses) {
            for (const privateIp of network.privateIpAddresses) {
              if (privateIp && !vmIps.private.includes(privateIp)) {
                vmIps.private.push(privateIp);
              }
            }
          }

          if (network?.publicIpAddresses) {
            for (const publicIpObj of network.publicIpAddresses) {
              const publicIp = publicIpObj.ipAddress || publicIpObj;
              if (publicIp && typeof publicIp === 'string' && !vmIps.public.includes(publicIp)) {
                vmIps.public.push(publicIp);
              }
            }
          }
        }

        console.log(`    ✅ IP addresses discovered for ${ipMap.size} VM(s)`);
        console.log('');

        // Process each VM
        for (const vm of vms) {
          const ips = ipMap.get(vm.name) || { private: [], public: [] };

          // Get power state
          let powerState = 'unknown';
          try {
            const powerStateCommand = `az vm get-instance-view --name ${vm.name} --resource-group ${vm.resourceGroup} --subscription ${sub.subscription_id} --query "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus" -o tsv`;
            const { stdout: powerStdout } = await execAsync(powerStateCommand);
            powerState = powerStdout.trim();
          } catch {
            // Power state query failed, continue with unknown
          }

          allVMs.push({
            id: vm.id,
            name: vm.name,
            resourceGroup: vm.resourceGroup,
            location: vm.location,
            vmSize: vm.hardwareProfile?.vmSize || 'unknown',
            osType: vm.storageProfile?.osDisk?.osType || 'unknown',
            provisioningState: vm.provisioningState || 'unknown',
            powerState: powerState,
            privateIpAddresses: ips.private,
            publicIpAddresses: ips.public,
            tags: vm.tags || {}
          });

          console.log(`    VM: ${vm.name}`);
          console.log(`      Resource Group: ${vm.resourceGroup}`);
          console.log(`      Location: ${vm.location}`);
          console.log(`      Size: ${vm.hardwareProfile?.vmSize || 'unknown'}`);
          console.log(`      OS: ${vm.storageProfile?.osDisk?.osType || 'unknown'}`);
          console.log(`      Power State: ${powerState}`);
          console.log(`      Private IPs: ${ips.private.length > 0 ? ips.private.join(', ') : '(none)'}`);
          console.log(`      Public IPs: ${ips.public.length > 0 ? ips.public.join(', ') : '(none)'}`);
          console.log('');
        }
      } catch (error: any) {
        console.log(`    ⚠️  Error discovering VMs: ${error.message}`);
        console.log('');
      }
    }

    // Summary
    console.log('='.repeat(70));
    console.log('📊 Discovery Summary');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Total Subscriptions: ${subscriptions.length}`);
    console.log(`Total Resource Groups: ${allResourceGroups.length}`);
    console.log(`Total VMs: ${allVMs.length}`);
    console.log('');

    if (allVMs.length === 0) {
      console.log('⚠️  No VMs found in any subscription');
      console.log('   This could mean:');
      console.log('   - No VMs deployed yet');
      console.log('   - VMs in different subscriptions');
      console.log('   - Access permission issues');
      console.log('');
      process.exit(0);
    }

    // Save VM data (JSON)
    const tenantSlug = tenant.name.toLowerCase().replace(/\s+/g, '-');
    const vmOutputPath = path.join(discoveryDir, `${tenantSlug}-vms.json`);
    const vmOutput = {
      tenant: tenant,
      discovered_at: new Date().toISOString(),
      vm_count: allVMs.length,
      resource_group_count: allResourceGroups.length,
      vms: allVMs
    };

    fs.writeFileSync(vmOutputPath, JSON.stringify(vmOutput, null, 2));
    console.log(`💾 VM Data (JSON): ${vmOutputPath}`);

    // Save resource group data (JSON)
    const rgOutputPath = path.join(discoveryDir, `${tenantSlug}-resource-groups.json`);
    const rgOutput = {
      tenant: tenant,
      discovered_at: new Date().toISOString(),
      resource_group_count: allResourceGroups.length,
      resource_groups: allResourceGroups
    };

    fs.writeFileSync(rgOutputPath, JSON.stringify(rgOutput, null, 2));
    console.log(`💾 Resource Group Data (JSON): ${rgOutputPath}`);

    // Save VM data (CSV)
    const csvOutputPath = path.join(discoveryDir, `${tenantSlug}-vms.csv`);
    const csvHeaders = [
      'VM Name',
      'Resource Group',
      'Location',
      'VM Size',
      'OS Type',
      'Power State',
      'Private IPs',
      'Public IPs',
      'Provisioning State'
    ];

    const csvRows = allVMs.map(vm => [
      vm.name,
      vm.resourceGroup,
      vm.location,
      vm.vmSize,
      vm.osType,
      vm.powerState || 'unknown',
      vm.privateIpAddresses.join('; '),
      vm.publicIpAddresses.join('; '),
      vm.provisioningState
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => {
        const str = String(cell);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','))
    ].join('\n');

    fs.writeFileSync(csvOutputPath, csvContent);
    console.log(`💾 VM Data (CSV): ${csvOutputPath}`);
    console.log('');

    console.log('─'.repeat(70));
    console.log('💡 Next Steps');
    console.log('─'.repeat(70));
    console.log('');
    console.log('1. Review discovered data:');
    console.log(`   - Open ${tenantSlug}-vms.csv in Excel/Numbers`);
    console.log(`   - Verify all expected VMs are present`);
    console.log('');
    console.log('2. Create ServiceNow CIs:');
    console.log(`   npx tsx scripts/onboard-azure-tenant-complete.ts --tenant ${tenantKey}`);
    console.log('');
    console.log('Or run individual steps:');
    console.log(`   npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json`);
    console.log(`   npx tsx scripts/create-azure-resource-group-cis.ts backup/azure-discovery/${tenantSlug}-resource-groups.json`);
    console.log(`   npx tsx scripts/create-azure-vm-cis.ts backup/azure-discovery/${tenantSlug}-vms.json`);
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ Discovery failed:');
    console.error(error.message || error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Parse arguments
const args = process.argv.slice(2);
let tenantKey: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tenant' && args[i + 1]) {
    tenantKey = args[i + 1];
  }
}

if (!tenantKey) {
  console.error('❌ Usage: npx tsx scripts/discover-azure-vms-cli.ts --tenant <tenant-name>');
  console.error('');
  console.error('Available tenants: exceptional, altus, neighbors, austin');
  process.exit(1);
}

discoverAzureVMs(tenantKey)
  .catch(console.error)
  .finally(() => process.exit(0));
