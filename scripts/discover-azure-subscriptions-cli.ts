/**
 * Discover Azure Subscriptions via CLI
 *
 * Uses Azure CLI to discover all subscriptions in a tenant.
 * Automatically updates configuration file with discovered subscriptions.
 *
 * PREREQUISITES:
 * - Azure CLI installed: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
 * - Logged in: az login
 * - Access to tenant
 *
 * USAGE:
 *   npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant exceptional
 *   npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant-id 0b166095-cbbb-4a47-b5d2-45df5415ee8a
 *
 * OUTPUTS:
 * - backup/azure-discovery/<tenant-name>-subscriptions.json
 * - Updates config/azure/altus-azure-structure.json
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execAsync = promisify(exec);

interface AzureSubscription {
  id: string;
  subscriptionId: string;
  tenantId: string;
  displayName: string;
  state: string;
  isDefault: boolean;
}

const TENANT_MAP: Record<string, { id: string; name: string; domain: string }> = {
  exceptional: {
    id: '0b166095-cbbb-4a47-b5d2-45df5415ee8a',
    name: 'Exceptional Emergency Center',
    domain: 'altuscommunityhealthcare.onmicrosoft.com'
  },
  altus: {
    id: '64c9180e-db30-45b8-af76-82f8930da669',
    name: 'Altus Community Healthcare',
    domain: 'ztaltus.onmicrosoft.com'
  },
  neighbors: {
    id: 'fa52c9a8-e65a-4d5f-bbb1-4f545fc79443',
    name: 'Neighbors Health',
    domain: 'neighborshealth.onmicrosoft.com'
  },
  austin: {
    id: '059c922d-abff-42ec-8f0a-ca78ccdec003',
    name: 'Austin Emergency Center',
    domain: 'austiner.onmicrosoft.com'
  }
};

async function discoverAzureSubscriptions(tenantKey?: string, tenantId?: string) {
  console.log('☁️  Discover Azure Subscriptions via CLI');
  console.log('='.repeat(70));
  console.log('');

  // Resolve tenant
  let tenant: { id: string; name: string; domain: string };

  if (tenantKey && TENANT_MAP[tenantKey.toLowerCase()]) {
    tenant = TENANT_MAP[tenantKey.toLowerCase()];
  } else if (tenantId) {
    // Find tenant by ID
    const foundTenant = Object.values(TENANT_MAP).find(t => t.id === tenantId);
    if (!foundTenant) {
      console.error(`❌ Unknown tenant ID: ${tenantId}`);
      process.exit(1);
    }
    tenant = foundTenant;
  } else {
    console.error('❌ Must specify --tenant or --tenant-id');
    console.error('');
    console.error('Usage:');
    console.error('  npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant exceptional');
    console.error('  npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant-id <guid>');
    console.error('');
    console.error('Available tenants: exceptional, altus, neighbors, austin');
    process.exit(1);
  }

  console.log(`Tenant: ${tenant.name}`);
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`Domain: ${tenant.domain}`);
  console.log('');

  try {
    // Check Azure CLI installed
    console.log('Checking Azure CLI...');
    try {
      await execAsync('az --version');
      console.log('  ✅ Azure CLI found');
    } catch (error) {
      console.error('  ❌ Azure CLI not installed');
      console.error('');
      console.error('Install Azure CLI:');
      console.error('  macOS: brew install azure-cli');
      console.error('  Windows: https://aka.ms/installazurecliwindows');
      console.error('  Linux: https://aka.ms/installazureclilinux');
      process.exit(1);
    }

    // Check logged in
    console.log('Checking Azure login...');
    try {
      await execAsync('az account show');
      console.log('  ✅ Logged into Azure');
    } catch (error) {
      console.error('  ❌ Not logged into Azure');
      console.error('');
      console.error('Login with:');
      console.error('  az login');
      process.exit(1);
    }

    console.log('');

    // Discover subscriptions
    console.log('Discovering subscriptions...');
    console.log('');

    // List all subscriptions and filter by tenant ID
    const command = `az account list --all --output json`;
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('WARNING')) {
      console.error('❌ Azure CLI error:');
      console.error(stderr);
      process.exit(1);
    }

    const allSubscriptions: AzureSubscription[] = JSON.parse(stdout);

    // Filter to only this tenant
    const subscriptions = allSubscriptions.filter(sub => sub.tenantId === tenant.id);

    if (subscriptions.length === 0) {
      console.log('⚠️  No subscriptions found in this tenant');
      console.log(`   Tenant ID: ${tenant.id}`);
      console.log(`   Total subscriptions accessible: ${allSubscriptions.length}`);
      console.log('   Check if you have access to this tenant');
      process.exit(0);
    }

    console.log(`✅ Found ${subscriptions.length} subscription(s):`);
    console.log('');

    for (const sub of subscriptions) {
      console.log(`  ${sub.name || sub.displayName || '(no name)'}`);
      console.log(`    Subscription ID: ${sub.id || sub.subscriptionId || '(no id)'}`);
      console.log(`    State: ${sub.state}`);
      console.log(`    Default: ${sub.isDefault ? 'Yes' : 'No'}`);
      console.log('');
    }

    // Save to backup
    const outputDir = path.join(process.cwd(), 'backup', 'azure-discovery');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const tenantSlug = tenant.name.toLowerCase().replace(/\s+/g, '-');
    const outputPath = path.join(outputDir, `${tenantSlug}-subscriptions.json`);

    const output = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain
      },
      discovered_at: new Date().toISOString(),
      subscription_count: subscriptions.length,
      subscriptions: subscriptions.map(sub => ({
        subscription_id: sub.id || sub.subscriptionId,
        subscription_name: sub.name || sub.displayName,
        state: sub.state,
        is_default: sub.isDefault,
        tenant_id: sub.tenantId
      }))
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log('─'.repeat(70));
    console.log(`💾 Saved to: ${outputPath}`);
    console.log('');

    // Update config file
    console.log('Updating configuration file...');
    const configPath = path.join(process.cwd(), 'config', 'azure', 'altus-azure-structure.json');

    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      // Find tenant in config
      const tenantConfig = config.tenants.find((t: any) => t.tenant_id === tenant.id);

      if (tenantConfig) {
        // Update subscriptions
        tenantConfig.subscriptions = subscriptions.map(sub => ({
          subscription_name: sub.name || sub.displayName || 'Unknown Subscription',
          subscription_id: sub.id || sub.subscriptionId || 'unknown',
          subscription_type: sub.state === 'Enabled' ? 'Production' : 'Disabled',
          environment: 'Production',
          link_to_application_service: 'Altus Health - Azure Environment',
          description: `Azure subscription for ${tenant.name}. State: ${sub.state}`
        }));

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`  ✅ Updated config with ${subscriptions.length} subscription(s)`);
        console.log(`  📄 ${configPath}`);
      } else {
        console.log(`  ⚠️  Tenant not found in config file`);
        console.log(`     Tenant ID: ${tenant.id}`);
      }
    } else {
      console.log(`  ⚠️  Config file not found: ${configPath}`);
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('💡 Next Steps');
    console.log('─'.repeat(70));
    console.log('');
    console.log('1. Discover VMs and resource groups:');
    console.log(`   npx tsx scripts/discover-azure-vms-cli.ts --tenant ${tenantKey || tenantSlug}`);
    console.log('');
    console.log('2. Or run complete onboarding:');
    console.log(`   npx tsx scripts/onboard-azure-tenant-complete.ts --tenant ${tenantKey || tenantSlug}`);
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ Discovery failed:');
    console.error(error.message || error);
    process.exit(1);
  }
}

// Parse arguments
const args = process.argv.slice(2);
let tenantKey: string | undefined;
let tenantId: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tenant' && args[i + 1]) {
    tenantKey = args[i + 1];
  } else if (args[i] === '--tenant-id' && args[i + 1]) {
    tenantId = args[i + 1];
  }
}

discoverAzureSubscriptions(tenantKey, tenantId)
  .catch(console.error)
  .finally(() => process.exit(0));
