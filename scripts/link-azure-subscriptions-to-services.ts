/**
 * Link Azure Subscriptions to Services
 *
 * Creates CI relationships between Azure subscription CIs and ServiceNow services:
 * 1. All subscriptions → "Infrastructure and Cloud Management" Service Offering (Contains::Contained by)
 * 2. Subscriptions → Application Services (Depends on::Used by) if specified in config
 *
 * USAGE:
 *   npx tsx scripts/link-azure-subscriptions-to-services.ts config/azure/altus-azure-structure.json
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * RELATIONSHIP TYPES:
 * - Service Offering → Subscription: "Contains::Contained by"
 * - Subscription → Application Service: "Depends on::Used by"
 *
 * IDEMPOTENT: Safe to run multiple times, checks for existing relationships.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface Subscription {
  subscription_name: string;
  subscription_id: string;
  link_to_application_service?: string;
  description: string;
}

interface Tenant {
  tenant_name: string;
  subscriptions: Subscription[];
}

interface AzureConfig {
  client_name: string;
  tenants: Tenant[];
}

async function linkAzureSubscriptionsToServices(configPath: string) {
  console.log('🔗 Linking Azure Subscriptions to Services');
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
  console.log('');

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
    soLinksCreated: 0,
    soLinksExisting: 0,
    appLinksCreated: 0,
    appLinksExisting: 0,
    appServiceMissing: [] as string[],
    subscriptionNotFound: [] as string[],
    errors: [] as string[]
  };

  try {
    // Phase 1: Lookup Infrastructure and Cloud Management Service Offering
    console.log('Phase 1: Lookup Service Offering');
    console.log('─'.repeat(70));
    console.log('');

    const serviceOfferingName = 'Infrastructure and Cloud Management';
    const soQuery = encodeURIComponent(`name=${serviceOfferingName}`);
    const soUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${soQuery}&sysparm_limit=1&sysparm_fields=sys_id,name`;

    const soResponse = await fetch(soUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (!soResponse.ok) {
      console.error(`❌ Failed to query Service Offerings: ${soResponse.status}`);
      process.exit(1);
    }

    const soData = await soResponse.json();
    const serviceOfferings = soData.result || [];

    if (serviceOfferings.length === 0) {
      console.error(`❌ Service Offering not found: "${serviceOfferingName}"`);
      console.error('   Create it first or update the script with correct name');
      process.exit(1);
    }

    const serviceOfferingSysId = serviceOfferings[0].sys_id;
    console.log(`✅ Found: ${serviceOfferingName}`);
    console.log(`   sys_id: ${serviceOfferingSysId}`);
    console.log('');

    // Phase 2: Link each subscription to Service Offering
    console.log('Phase 2: Link Subscriptions to Service Offering');
    console.log('─'.repeat(70));
    console.log('');

    for (const tenant of config.tenants) {
      console.log(`Tenant: ${tenant.tenant_name}`);
      console.log('');

      for (const sub of tenant.subscriptions) {
        console.log(`  ${sub.subscription_name}`);

        // Find subscription CI
        const subQuery = encodeURIComponent(`name=${sub.subscription_name}`);
        const subUrl = `${instanceUrl}/api/now/table/cmdb_ci_azure_subscription?sysparm_query=${subQuery}&sysparm_limit=1&sysparm_fields=sys_id,name`;

        const subResponse = await fetch(subUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (!subResponse.ok) {
          console.log(`    ❌ Error querying subscription`);
          results.errors.push(`${sub.subscription_name}: Query failed`);
          console.log('');
          continue;
        }

        const subData = await subResponse.json();
        const subscriptions = subData.result || [];

        if (subscriptions.length === 0) {
          console.log(`    ⚠️  Subscription CI not found (run create script first)`);
          results.subscriptionNotFound.push(sub.subscription_name);
          console.log('');
          continue;
        }

        const subscriptionSysId = subscriptions[0].sys_id;

        // Check if relationship already exists
        const relQuery = encodeURIComponent(
          `parent=${serviceOfferingSysId}^child=${subscriptionSysId}^type.name=Contains::Contained by`
        );
        const relCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${relQuery}&sysparm_limit=1`;

        const relCheckResponse = await fetch(relCheckUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (relCheckResponse.ok) {
          const relCheckData = await relCheckResponse.json();
          const existing = relCheckData.result || [];

          if (existing.length > 0) {
            console.log(`    ⏭️  Already linked to Service Offering`);
            results.soLinksExisting++;
            console.log('');
            continue;
          }
        }

        // Create CI relationship
        const ciRelPayload = {
          parent: serviceOfferingSysId,
          child: subscriptionSysId,
          type: 'Contains::Contained by',
        };

        const ciRelUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;

        const ciRelResponse = await fetch(ciRelUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ciRelPayload),
        });

        if (!ciRelResponse.ok) {
          const errorText = await ciRelResponse.text();
          console.log(`    ❌ Failed to create relationship: ${ciRelResponse.status}`);
          results.errors.push(`${sub.subscription_name}: Link failed`);
        } else {
          console.log(`    ✅ Linked to Service Offering`);
          results.soLinksCreated++;
        }

        console.log('');
      }
    }

    // Phase 3: Link to Application Services (if specified)
    console.log('Phase 3: Link to Application Services (Optional)');
    console.log('─'.repeat(70));
    console.log('');

    const subsWithAppServices = config.tenants.flatMap(t =>
      t.subscriptions
        .filter(s => s.link_to_application_service)
        .map(s => ({ tenant: t.tenant_name, ...s }))
    );

    if (subsWithAppServices.length === 0) {
      console.log('⏭️  No Application Service mappings in config (skipped)');
      console.log('');
    } else {
      console.log(`Processing ${subsWithAppServices.length} Application Service mapping(s)...`);
      console.log('');

      for (const sub of subsWithAppServices) {
        console.log(`  ${sub.subscription_name} → ${sub.link_to_application_service}`);

        // Find subscription CI
        const subQuery = encodeURIComponent(`name=${sub.subscription_name}`);
        const subUrl = `${instanceUrl}/api/now/table/cmdb_ci_azure_subscription?sysparm_query=${subQuery}&sysparm_limit=1&sysparm_fields=sys_id`;

        const subResponse = await fetch(subUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (!subResponse.ok || (await subResponse.json()).result.length === 0) {
          console.log(`    ⚠️  Subscription not found`);
          console.log('');
          continue;
        }

        const subscriptionSysId = (await fetch(subUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        }).then(r => r.json())).result[0].sys_id;

        // Find Application Service
        const appQuery = encodeURIComponent(`name=${sub.link_to_application_service}`);
        const appUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${appQuery}&sysparm_limit=1&sysparm_fields=sys_id,name`;

        const appResponse = await fetch(appUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (!appResponse.ok) {
          console.log(`    ❌ Error querying Application Service`);
          console.log('');
          continue;
        }

        const appData = await appResponse.json();
        const appServices = appData.result || [];

        if (appServices.length === 0) {
          console.log(`    ⚠️  Application Service not found: "${sub.link_to_application_service}"`);
          results.appServiceMissing.push(sub.link_to_application_service!);
          console.log('');
          continue;
        }

        const appServiceSysId = appServices[0].sys_id;

        // Check existing relationship
        const appRelQuery = encodeURIComponent(
          `parent=${subscriptionSysId}^child=${appServiceSysId}^type.name=Depends on::Used by`
        );
        const appRelCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${appRelQuery}&sysparm_limit=1`;

        const appRelCheckResponse = await fetch(appRelCheckUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (appRelCheckResponse.ok) {
          const appRelCheckData = await appRelCheckResponse.json();
          const existingApp = appRelCheckData.result || [];

          if (existingApp.length > 0) {
            console.log(`    ⏭️  Already linked to Application Service`);
            results.appLinksExisting++;
            console.log('');
            continue;
          }
        }

        // Create Application Service relationship
        const appRelPayload = {
          parent: subscriptionSysId,
          child: appServiceSysId,
          type: 'Depends on::Used by',
        };

        const appRelUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
        const appRelResponse = await fetch(appRelUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(appRelPayload),
        });

        if (!appRelResponse.ok) {
          console.log(`    ❌ Failed to link to Application Service`);
          results.errors.push(`${sub.subscription_name} → App Service`);
        } else {
          console.log(`    ✅ Linked to Application Service`);
          results.appLinksCreated++;
        }

        console.log('');
      }
    }

    // Summary
    console.log('='.repeat(70));
    console.log('📊 Summary');
    console.log('='.repeat(70));
    console.log('');
    console.log('Service Offering Links:');
    console.log(`  ✅ Created: ${results.soLinksCreated}`);
    console.log(`  ⏭️  Existing: ${results.soLinksExisting}`);
    console.log('');
    console.log('Application Service Links:');
    console.log(`  ✅ Created: ${results.appLinksCreated}`);
    console.log(`  ⏭️  Existing: ${results.appLinksExisting}`);
    console.log(`  ⚠️  Missing Services: ${results.appServiceMissing.length}`);
    console.log('');
    console.log(`❌ Errors: ${results.errors.length}`);
    console.log('');

    if (results.subscriptionNotFound.length > 0) {
      console.log('⚠️  Subscriptions Not Found (create CIs first):');
      for (const name of results.subscriptionNotFound) {
        console.log(`  - ${name}`);
      }
      console.log('');
    }

    if (results.appServiceMissing.length > 0) {
      console.log('⚠️  Application Services Not Found:');
      for (const name of [...new Set(results.appServiceMissing)]) {
        console.log(`  - ${name}`);
      }
      console.log('   Create these services or update config mappings');
      console.log('');
    }

    if (results.errors.length > 0) {
      console.log('❌ Errors:');
      for (const error of results.errors) {
        console.log(`  - ${error}`);
      }
      console.log('');
    }

    console.log('─'.repeat(70));
    console.log('💡 Next Steps');
    console.log('─'.repeat(70));
    console.log('');
    console.log('1. Verify relationships in ServiceNow:');
    console.log(`   Navigate to: CMDB > Configuration > Azure Subscriptions`);
    console.log('   Open any subscription → CI Relationships tab');
    console.log('');
    console.log('2. Run verification script:');
    console.log(`   npx tsx scripts/verify-azure-ci-structure.ts ${configPath}`);
    console.log('');

    if (results.errors.length > 0 || results.subscriptionNotFound.length > 0) {
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
  console.error('❌ Usage: npx tsx scripts/link-azure-subscriptions-to-services.ts <config-file.json>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/link-azure-subscriptions-to-services.ts config/azure/altus-azure-structure.json');
  process.exit(1);
}

linkAzureSubscriptionsToServices(configPath)
  .catch(console.error)
  .finally(() => process.exit(0));
