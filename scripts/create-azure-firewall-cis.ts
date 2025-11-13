/**
 * Create Firewall/NVA CIs from Azure VM discovery
 *
 * Identifies firewall virtual machines (e.g., Palo Alto) and creates cmdb_ci_ip_firewall records.
 *
 * Usage:
 *   npx tsx scripts/create-azure-firewall-cis.ts backup/azure-discovery/altus-community-healthcare-vms.json
 *   npx tsx scripts/create-azure-firewall-cis.ts backup/azure-discovery/altus-community-healthcare-vms.json --match paloalto,fortinet
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface VmRecord {
  name: string;
  resourceGroup: string;
  location: string;
  privateIpAddresses: string[];
  publicIpAddresses: string[];
  tags: Record<string, string>;
}

function parseMatchers(args: string[]): string[] {
  const matchIndex = args.indexOf('--match');
  if (matchIndex >= 0 && args[matchIndex + 1]) {
    return args[matchIndex + 1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  return ['palo', 'firewall', 'fortinet', 'panw', 'nva'];
}

async function createFirewallCIs(filePath: string, keywords: string[]) {
  console.log('🔥 Creating Firewall / NVA CIs');
  console.log('='.repeat(70));
  console.log('');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Discovery file not found: ${filePath}`);
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const vms: VmRecord[] = discovery.vms || [];
  const tenantName = discovery.tenant?.name || 'Unknown';

  console.log(`Tenant: ${tenantName}`);
  console.log(`VMs discovered: ${vms.length}`);
  console.log(`Matcher keywords: ${keywords.join(', ')}`);
  console.log('');

  const candidateVms = vms.filter(vm => {
    const normalizedName = vm.name.toLowerCase();
    return keywords.some(keyword => normalizedName.includes(keyword));
  });

  console.log(`Firewall candidates: ${candidateVms.length}`);
  console.log('');

  if (candidateVms.length === 0) {
    console.log('⚠️  No matching firewall VMs found');
    process.exit(0);
  }

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  let created = 0;
  let existing = 0;
  let linked = 0;
  let errors = 0;

  for (const vm of candidateVms) {
    console.log(`${vm.name}`);

    // Resolve resource group CI
    const rgUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_query=name=${encodeURIComponent(vm.resourceGroup)}&sysparm_limit=1&sysparm_fields=sys_id`;
    const rgResp = await fetch(rgUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

    if (!rgResp.ok) {
      console.log(`  ❌ Failed to lookup resource group ${vm.resourceGroup}`);
      errors++;
      continue;
    }

    const rgData = await rgResp.json();
    const rgRecord = rgData.result?.[0];

    if (!rgRecord) {
      console.log(`  ⚠️  Resource group missing in CMDB: ${vm.resourceGroup}`);
      errors++;
      continue;
    }

    const resourceGroupSysId = rgRecord.sys_id;
    console.log(`  📎 Parent resource group: ${vm.resourceGroup}`);

    // Check existing firewall CI
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=name=${encodeURIComponent(vm.name)}&sysparm_limit=1&sysparm_fields=sys_id`;
    const checkResp = await fetch(checkUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

    if (!checkResp.ok) {
      console.log('  ❌ Failed to check existing firewall CI');
      errors++;
      continue;
    }

    const checkData = await checkResp.json();
    let firewallSysId: string | null = null;

    if (checkData.result?.length > 0) {
      firewallSysId = checkData.result[0].sys_id;
      console.log('  ⏭️  Already exists');
      existing++;
    } else {
      const payload = {
        name: vm.name,
        short_description: `Azure Firewall / NVA (${vm.location})`,
        ip_address: vm.privateIpAddresses[0] || vm.publicIpAddresses[0] || undefined,
        location: vm.location,
        install_status: '1',
        operational_status: '1',
        comments: `Auto-created from VM discovery. Private IPs: ${vm.privateIpAddresses.join(', ') || 'n/a'}. Public IPs: ${vm.publicIpAddresses.join(', ') || 'n/a'}.`
      };

      const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall`;
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!createResp.ok) {
        console.log('  ❌ Failed to create firewall CI');
        errors++;
        continue;
      }

      const createData = await createResp.json();
      firewallSysId = createData.result.sys_id;
      console.log('  ✅ Created');
      created++;
    }

    if (!firewallSysId) {
      continue;
    }

    // Link to resource group
    const relQuery = `parent=${resourceGroupSysId}^child=${firewallSysId}`;
    const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(relQuery)}&sysparm_limit=1`;
    const relResp = await fetch(relUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

    if (!relResp.ok) {
      console.log('  ❌ Failed to check relationship');
      continue;
    }

    const relData = await relResp.json();
    if (relData.result?.length > 0) {
      console.log('  🔗 Already linked to resource group');
    } else {
      const relCreateResp = await fetch(`${instanceUrl}/api/now/table/cmdb_rel_ci`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: resourceGroupSysId, child: firewallSysId, type: 'Contains::Contained by' })
      });

      if (relCreateResp.ok) {
        console.log('  🔗 Linked to resource group');
        linked++;
      } else {
        console.log('  ❌ Failed to link to resource group');
      }
    }
  }

  console.log('');
  console.log(`✅ Created: ${created}, ⏭️  Existing: ${existing}, 🔗 Linked: ${linked}, ❌ Errors: ${errors}`);
}

const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath) {
  console.error('Usage: npx tsx scripts/create-azure-firewall-cis.ts <vms-json> [--match keyword1,keyword2]');
  process.exit(1);
}

const keywords = parseMatchers(args.slice(1));

createFirewallCIs(filePath, keywords).catch(error => {
  console.error('❌ Failed to create firewall CIs');
  console.error(error);
  process.exit(1);
});
