/**
 * Create Azure VNet Gateway CIs
 *
 * Converts discovered virtual network gateways into cmdb_ci_ip_router records
 * and links them to their parent virtual networks (or resource groups).
 *
 * Usage:
 *   npx tsx scripts/create-azure-vnet-gateway-cis.ts backup/azure-discovery/altus-community-healthcare-vnet-gateways.json
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface GatewayRecord {
  id: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  gatewayType?: string;
  vpnType?: string;
  sku?: string;
  provisioningState?: string;
  virtualNetwork?: string | null;
  subnetResourceIds: string[];
  publicIpAddresses: string[];
}

async function createAzureGatewayCIs(filePath: string) {
  console.log('🚦 Creating Azure VNet Gateway CIs');
  console.log('='.repeat(70));
  console.log('');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Discovery file not found: ${filePath}`);
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const gateways: GatewayRecord[] = discovery.gateways || [];

  console.log(`Tenant: ${discovery.tenant?.name || 'Unknown'}`);
  console.log(`Gateways: ${gateways.length}`);
  console.log('');

  if (gateways.length === 0) {
    console.log('⚠️  No gateways to create');
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
  let linkedToVnet = 0;
  let linkedToResourceGroup = 0;
  let errors = 0;

  for (const gateway of gateways) {
    console.log(`${gateway.name}`);

    // Resolve resource group CI
    const rgUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_query=name=${encodeURIComponent(gateway.resourceGroup)}&sysparm_limit=1&sysparm_fields=sys_id`;
    const rgResp = await fetch(rgUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

    if (!rgResp.ok) {
      console.log(`  ❌ Failed to lookup resource group ${gateway.resourceGroup}`);
      errors++;
      continue;
    }

    const rgData = await rgResp.json();
    const rgRecord = rgData.result?.[0];
    if (!rgRecord) {
      console.log(`  ⚠️  Resource group missing in CMDB: ${gateway.resourceGroup}`);
      errors++;
      continue;
    }

    const resourceGroupSysId = rgRecord.sys_id;
    console.log(`  📎 Parent resource group: ${gateway.resourceGroup}`);

    // Resolve VNet CI if available
    let vnetSysId: string | null = null;
    if (gateway.virtualNetwork) {
      const vnetUrl = `${instanceUrl}/api/now/table/cmdb_ci_network?sysparm_query=name=${encodeURIComponent(gateway.virtualNetwork)}&sysparm_limit=1&sysparm_fields=sys_id`;
      const vnetResp = await fetch(vnetUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });
      if (vnetResp.ok) {
        const vnetData = await vnetResp.json();
        vnetSysId = vnetData.result?.[0]?.sys_id || null;
        if (vnetSysId) {
          console.log(`  🌐 Attached VNet: ${gateway.virtualNetwork}`);
        } else {
          console.log(`  ⚠️  VNet not found in CMDB: ${gateway.virtualNetwork}`);
        }
      }
    }

    // Check existing gateway CI
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_router?sysparm_query=name=${encodeURIComponent(gateway.name)}&sysparm_limit=1&sysparm_fields=sys_id`;
    const checkResp = await fetch(checkUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

    if (!checkResp.ok) {
      console.log('  ❌ Failed to check existing CI');
      errors++;
      continue;
    }

    const checkData = await checkResp.json();
    let gatewaySysId: string | null = null;

    if (checkData.result?.length > 0) {
      gatewaySysId = checkData.result[0].sys_id;
      console.log('  ⏭️  Already exists');
      existing++;
    } else {
      const payload = {
        name: gateway.name,
        short_description: `Azure VNet Gateway (${gateway.gatewayType || gateway.vpnType || 'Unknown'})`,
        ip_address: gateway.publicIpAddresses.join(', ') || undefined,
        location: gateway.location,
        install_status: '1',
        operational_status: '1',
        comments: `Subscription: ${gateway.subscriptionId}\nGatewayType: ${gateway.gatewayType || 'n/a'}\nSKU: ${gateway.sku || 'n/a'}`
      };

      const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_router`;
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!createResp.ok) {
        console.log('  ❌ Failed to create gateway CI');
        errors++;
        continue;
      }

      const createData = await createResp.json();
      gatewaySysId = createData.result.sys_id;
      console.log('  ✅ Created');
      created++;
    }

    if (!gatewaySysId) {
      continue;
    }

    // Link to VNet if available, otherwise to resource group
    const parentTargets: Array<{ parent: string; label: string; counter: () => void }> = [];
    if (vnetSysId) {
      parentTargets.push({ parent: vnetSysId, label: 'virtual network', counter: () => { linkedToVnet++; } });
    } else {
      parentTargets.push({ parent: resourceGroupSysId, label: 'resource group', counter: () => { linkedToResourceGroup++; } });
    }

    for (const target of parentTargets) {
      const relQuery = `parent=${target.parent}^child=${gatewaySysId}`;
      const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(relQuery)}&sysparm_limit=1`;
      const relResp = await fetch(relUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

      if (!relResp.ok) {
        console.log(`  ❌ Failed to check ${target.label} relationship`);
        continue;
      }

      const relData = await relResp.json();
      if (relData.result?.length > 0) {
        console.log(`  🔗 Already linked to ${target.label}`);
      } else {
        const relCreateResp = await fetch(`${instanceUrl}/api/now/table/cmdb_rel_ci`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent: target.parent, child: gatewaySysId, type: 'Contains::Contained by' })
        });

        if (relCreateResp.ok) {
          console.log(`  🔗 Linked to ${target.label}`);
          target.counter();
        } else {
          console.log(`  ❌ Failed to link to ${target.label}`);
        }
      }
    }
  }

  console.log('');
  console.log(`✅ Created: ${created}, ⏭️  Existing: ${existing}, 🔗 Linked to VNet: ${linkedToVnet}, 🔗 Linked to RG: ${linkedToResourceGroup}, ❌ Errors: ${errors}`);
}

const [filePath] = process.argv.slice(2);
if (!filePath) {
  console.error('Usage: npx tsx scripts/create-azure-vnet-gateway-cis.ts <vnet-gateways-json>');
  process.exit(1);
}

createAzureGatewayCIs(filePath).catch(error => {
  console.error('❌ Failed to create Azure VNet Gateway CIs');
  console.error(error);
  process.exit(1);
});
