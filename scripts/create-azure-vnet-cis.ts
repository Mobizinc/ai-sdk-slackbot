/**
 * Create Azure Virtual Network CIs
 *
 * Reads virtual network discovery data and creates/links cmdb_ci_network records.
 *
 * Usage:
 *   npx tsx scripts/create-azure-vnet-cis.ts backup/azure-discovery/altus-community-healthcare-vnets.json
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface VNetRecord {
  id: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  addressPrefixes: string[];
  dnsServers: string[];
  subnets: Array<{
    name: string;
    addressPrefix: string;
    nsgId?: string | null;
    routeTableId?: string | null;
  }>;
}

async function createAzureVnetCIs(filePath: string) {
  console.log('🌐 Creating Azure Virtual Network CIs');
  console.log('='.repeat(70));
  console.log('');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Discovery file not found: ${filePath}`);
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const vnets: VNetRecord[] = discovery.vnets || [];

  console.log(`Tenant: ${discovery.tenant?.name || 'Unknown'}`);
  console.log(`Virtual Networks: ${vnets.length}`);
  console.log('');

  if (vnets.length === 0) {
    console.log('⚠️  No virtual networks to create');
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

  for (const vnet of vnets) {
    console.log(`${vnet.name}`);

    // Find parent resource group
    const rgUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_query=name=${encodeURIComponent(vnet.resourceGroup)}&sysparm_limit=1&sysparm_fields=sys_id`;
    const rgResp = await fetch(rgUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

    if (!rgResp.ok) {
      console.log(`  ❌ Failed to lookup resource group ${vnet.resourceGroup}`);
      errors++;
      continue;
    }

    const rgData = await rgResp.json();
    const rgRecord = rgData.result?.[0];

    if (!rgRecord) {
      console.log(`  ⚠️  Resource group not found in CMDB: ${vnet.resourceGroup}`);
      errors++;
      continue;
    }

    const resourceGroupSysId = rgRecord.sys_id;
    console.log(`  📎 Parent resource group: ${vnet.resourceGroup}`);

    // Check existing VNet CI
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_network?sysparm_query=name=${encodeURIComponent(vnet.name)}&sysparm_limit=1&sysparm_fields=sys_id,ip_address`;
    const checkResp = await fetch(checkUrl, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });

    if (!checkResp.ok) {
      console.log(`  ❌ Failed to check existing CI`);
      errors++;
      continue;
    }

    const checkData = await checkResp.json();
    let vnetSysId: string | null = null;

    if (checkData.result?.length > 0) {
      vnetSysId = checkData.result[0].sys_id;
      console.log('  ⏭️  Already exists');
      existing++;
    } else {
      const payload = {
        name: vnet.name,
        short_description: `Azure Virtual Network (${vnet.location})`,
        location: vnet.location,
        ip_address: vnet.addressPrefixes.join(', '),
        install_status: '1',
        operational_status: '1',
        comments: `Subscription: ${vnet.subscriptionId}\nDNS: ${vnet.dnsServers.join(', ') || 'inherit'}`
      };

      const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_network`;
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!createResp.ok) {
        console.log('  ❌ Failed to create VNet CI');
        errors++;
        continue;
      }

      const createData = await createResp.json();
      vnetSysId = createData.result.sys_id;
      console.log('  ✅ Created');
      created++;
    }

    if (!vnetSysId) {
      continue;
    }

    // Ensure relationship Resource Group -> VNet
    const relQuery = `parent=${resourceGroupSysId}^child=${vnetSysId}`;
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
        body: JSON.stringify({
          parent: resourceGroupSysId,
          child: vnetSysId,
          type: 'Contains::Contained by'
        })
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

const [filePath] = process.argv.slice(2);
if (!filePath) {
  console.error('Usage: npx tsx scripts/create-azure-vnet-cis.ts <vnets-json>');
  process.exit(1);
}

createAzureVnetCIs(filePath).catch(error => {
  console.error('❌ Failed to create Azure VNet CIs');
  console.error(error);
  process.exit(1);
});
