/**
 * Create Azure Subscription CIs
 *
 * Creates Azure subscription CI records in ServiceNow CMDB from configuration file.
 * Since ServiceNow has no cmdb_ci_azure_tenant table, tenant metadata is embedded
 * in subscription records.
 *
 * USAGE:
 *   npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * FIELD MAPPING:
 * - name → subscription_name
 * - company → company_sys_id from config
 * - object_id → tenant_id (Azure AD Tenant GUID)
 * - correlation_id → subscription_id (Azure Subscription GUID)
 * - short_description → Includes tenant domain and description
 * - operational_status → 1 (Operational)
 * - install_status → 1 (Installed)
 *
 * IDEMPOTENT: Safe to run multiple times, checks for existing CIs before creating.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface Subscription {
  subscription_name: string;
  subscription_id: string;
  subscription_type: string;
  environment: string;
  link_to_application_service?: string;
  description: string;
}

interface Tenant {
  tenant_name: string;
  tenant_id: string;
  tenant_domain: string;
  company_name: string;
  subscriptions: Subscription[];
}

interface AzureConfig {
  client_name: string;
  company_sys_id: string;
  description: string;
  tenants: Tenant[];
}

async function createAzureSubscriptionCIs(configPath: string) {
  console.log('☁️  Creating Azure Subscription CIs');
  console.log('='.repeat(70));
  console.log('');

  // Load configuration
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config: AzureConfig = JSON.parse(configContent);

  console.log(`Client: ${config.client_name}`);
  console.log(`Company sys_id: ${config.company_sys_id}`);
  console.log('');

  // Validate config
  if (config.company_sys_id.includes('REPLACE') || config.company_sys_id.includes('PLACEHOLDER')) {
    console.error('❌ Config error: company_sys_id not updated');
    console.error('   Run: npx tsx scripts/discover-company-structure.ts "ClientName"');
    process.exit(1);
  }

  // Count total subscriptions
  const totalSubscriptions = config.tenants.reduce((sum, t) => sum + t.subscriptions.length, 0);
  console.log(`Tenants: ${config.tenants.length}`);
  console.log(`Total Subscriptions to create: ${totalSubscriptions}`);
  console.log('');

  // Check for placeholders
  let hasPlaceholders = false;
  for (const tenant of config.tenants) {
    for (const sub of tenant.subscriptions) {
      if (sub.subscription_id.includes('PLACEHOLDER')) {
        hasPlaceholders = true;
        break;
      }
    }
    if (hasPlaceholders) break;
  }

  if (hasPlaceholders) {
    console.log('⚠️  WARNING: Configuration contains PLACEHOLDER subscription IDs');
    console.log('   These subscriptions will be created with placeholder values.');
    console.log('   Update config with real Azure subscription IDs for production use.');
    console.log('');
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

  const results = {
    created: [] as string[],
    existing: [] as string[],
    errors: [] as string[]
  };

  try {
    for (const tenant of config.tenants) {
      console.log('─'.repeat(70));
      console.log(`Tenant: ${tenant.tenant_name}`);
      console.log(`  Tenant ID: ${tenant.tenant_id}`);
      console.log(`  Domain: ${tenant.tenant_domain}`);
      console.log(`  Subscriptions: ${tenant.subscriptions.length}`);
      console.log('─'.repeat(70));
      console.log('');

      for (const sub of tenant.subscriptions) {
        console.log(`Processing: ${sub.subscription_name}`);

        // Check if subscription already exists (by name or correlation_id)
        const existsQuery = encodeURIComponent(
          `name=${sub.subscription_name}^ORcorrelation_id=${sub.subscription_id}`
        );
        const existsUrl = `${instanceUrl}/api/now/table/cmdb_ci_azure_subscription?sysparm_query=${existsQuery}&sysparm_fields=sys_id,name&sysparm_limit=1`;

        const existsResponse = await fetch(existsUrl, {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (!existsResponse.ok) {
          console.log(`  ❌ Error checking existing: ${existsResponse.status}`);
          results.errors.push(`${sub.subscription_name}: Check failed`);
          console.log('');
          continue;
        }

        const existsData = await existsResponse.json();
        const existing = existsData.result || [];

        if (existing.length > 0) {
          console.log(`  ⏭️  Already exists (sys_id: ${existing[0].sys_id})`);
          results.existing.push(sub.subscription_name);
          console.log('');
          continue;
        }

        // Create subscription CI
        const shortDescription = `Azure Subscription: ${sub.description}. Tenant: ${tenant.tenant_domain} (${tenant.tenant_id})`;

        const ciPayload = {
          name: sub.subscription_name,
          company: config.company_sys_id,
          object_id: tenant.tenant_id, // Store tenant ID here
          correlation_id: sub.subscription_id, // Store subscription ID here
          short_description: shortDescription,
          operational_status: '1', // Operational
          install_status: '1', // Installed
        };

        const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_azure_subscription`;

        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ciPayload),
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.log(`  ❌ Creation failed: ${createResponse.status}`);
          console.log(`     ${errorText}`);
          results.errors.push(`${sub.subscription_name}: ${createResponse.status}`);
        } else {
          const createData = await createResponse.json();
          const sysId = createData.result.sys_id;
          console.log(`  ✅ Created (sys_id: ${sysId})`);
          results.created.push(sub.subscription_name);
        }

        console.log('');
      }
    }

    // Summary
    console.log('='.repeat(70));
    console.log('📊 Summary');
    console.log('='.repeat(70));
    console.log('');
    console.log(`✅ Created: ${results.created.length}`);
    console.log(`⏭️  Already Existing: ${results.existing.length}`);
    console.log(`❌ Errors: ${results.errors.length}`);
    console.log('');

    if (results.created.length > 0) {
      console.log('Created Subscriptions:');
      for (const name of results.created) {
        console.log(`  - ${name}`);
      }
      console.log('');
    }

    if (results.existing.length > 0) {
      console.log('Existing Subscriptions (skipped):');
      for (const name of results.existing) {
        console.log(`  - ${name}`);
      }
      console.log('');
    }

    if (results.errors.length > 0) {
      console.log('Errors:');
      for (const error of results.errors) {
        console.log(`  - ${error}`);
      }
      console.log('');
    }

    console.log('─'.repeat(70));
    console.log('💡 Next Steps');
    console.log('─'.repeat(70));
    console.log('');

    if (results.created.length > 0) {
      console.log('1. Verify CIs in ServiceNow:');
      console.log(`   Navigate to: CMDB > Configuration > Azure Subscriptions`);
      console.log('');
      console.log('2. Link subscriptions to services:');
      console.log(`   npx tsx scripts/link-azure-subscriptions-to-services.ts ${configPath}`);
      console.log('');
      console.log('3. Verify complete structure:');
      console.log(`   npx tsx scripts/verify-azure-ci-structure.ts ${configPath}`);
    } else if (results.existing.length === totalSubscriptions) {
      console.log('All subscriptions already exist. Ready to link to services.');
      console.log('');
      console.log('Run:');
      console.log(`  npx tsx scripts/link-azure-subscriptions-to-services.ts ${configPath}`);
    }

    console.log('');

    if (results.errors.length > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Script failed:');
    console.error(error);
    process.exit(1);
  }
}

const configPath = process.argv[2];

if (!configPath) {
  console.error('❌ Usage: npx tsx scripts/create-azure-subscription-cis.ts <config-file.json>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json');
  process.exit(1);
}

createAzureSubscriptionCIs(configPath)
  .catch(console.error)
  .finally(() => process.exit(0));
