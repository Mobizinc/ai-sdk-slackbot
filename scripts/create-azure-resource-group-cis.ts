/**
 * Create Azure Resource Group CIs
 * Creates resource group CIs from discovered Azure data.
 * Usage: npx tsx scripts/create-azure-resource-group-cis.ts backup/azure-discovery/exceptional-resource-groups.json
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function createResourceGroupCIs(discoveryFilePath: string) {
  console.log('🔧 Creating Azure Resource Group CIs');
  console.log('='.repeat(70));
  console.log('');

  if (!fs.existsSync(discoveryFilePath)) {
    console.error(`❌ Discovery file not found: ${discoveryFilePath}`);
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(discoveryFilePath, 'utf-8'));
  const resourceGroups = discovery.resource_groups || [];

  console.log(`Tenant: ${discovery.tenant.name}`);
  console.log(`Resource Groups: ${resourceGroups.length}`);
  console.log('');

  if (resourceGroups.length === 0) {
    console.log('⚠️  No resource groups to create');
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

  for (const rg of resourceGroups) {
    console.log(`${rg.name}`);

    // Check existing
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group?sysparm_query=name=${encodeURIComponent(rg.name)}&sysparm_limit=1`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } });

    if (checkResp.ok) {
      const checkData = await checkResp.json();
      if (checkData.result?.length > 0) {
        console.log(`  ⏭️  Exists`);
        existing++;
        continue;
      }
    }

    // Create CI
    const payload = {
      name: rg.name,
      location: rg.location,
      short_description: `Azure Resource Group: ${rg.name}`,
      operational_status: '1',
      install_status: '1'
    };

    const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_resource_group`;
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (createResp.ok) {
      console.log(`  ✅ Created`);
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
  console.error('Usage: npx tsx scripts/create-azure-resource-group-cis.ts <discovery-file.json>');
  process.exit(1);
}

createResourceGroupCIs(filePath).catch(console.error);
