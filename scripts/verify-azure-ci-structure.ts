/**
 * Verify Azure CI Structure
 *
 * Verifies that Azure subscription CIs and relationships were created correctly.
 *
 * USAGE:
 *   npx tsx scripts/verify-azure-ci-structure.ts config/azure/altus-azure-structure.json
 *
 * CHECKS:
 * 1. All subscription CIs exist
 * 2. Tenant metadata correctly stored (object_id, correlation_id)
 * 3. Service Offering relationships exist
 * 4. Application Service relationships exist (if configured)
 *
 * OUTPUT:
 * - Console verification report
 * - Exit code 0 if all verified, 1 if issues found
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
}

interface Tenant {
  tenant_name: string;
  tenant_id: string;
  tenant_domain: string;
  subscriptions: Subscription[];
}

interface AzureConfig {
  client_name: string;
  company_sys_id: string;
  tenants: Tenant[];
}

async function verifyAzureStructure(configPath: string) {
  console.log('✅ Verifying Azure CI Structure');
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
    cisFound: 0,
    cisMissing: 0,
    soRelationsFound: 0,
    soRelationsMissing: 0,
    appRelationsFound: 0,
    appRelationsMissing: 0,
    metadataCorrect: 0,
    metadataIncorrect: 0,
    issues: [] as string[]
  };

  try {
    // Get Service Offering sys_id
    const serviceOfferingName = 'Infrastructure and Cloud Management';
    const soQuery = encodeURIComponent(`name=${serviceOfferingName}`);
    const soUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${soQuery}&sysparm_limit=1&sysparm_fields=sys_id`;

    const soResponse = await fetch(soUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    let serviceOfferingSysId = '';
    if (soResponse.ok) {
      const soData = await soResponse.json();
      if (soData.result?.length > 0) {
        serviceOfferingSysId = soData.result[0].sys_id;
      }
    }

    // Verify each subscription
    for (const tenant of config.tenants) {
      console.log('─'.repeat(70));
      console.log(`Tenant: ${tenant.tenant_name}`);
      console.log(`  Tenant ID: ${tenant.tenant_id}`);
      console.log('─'.repeat(70));
      console.log('');

      for (const sub of tenant.subscriptions) {
        console.log(`Checking: ${sub.subscription_name}`);

        // Find subscription CI
        const subQuery = encodeURIComponent(`name=${sub.subscription_name}`);
        const subUrl = `${instanceUrl}/api/now/table/cmdb_ci_azure_subscription?sysparm_query=${subQuery}&sysparm_limit=1&sysparm_display_value=all`;

        const subResponse = await fetch(subUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (!subResponse.ok) {
          console.log(`  ❌ Error querying subscription`);
          results.cisMissing++;
          results.issues.push(`${sub.subscription_name}: Query error`);
          console.log('');
          continue;
        }

        const subData = await subResponse.json();
        const subscriptions = subData.result || [];

        if (subscriptions.length === 0) {
          console.log(`  ❌ Subscription CI not found`);
          results.cisMissing++;
          results.issues.push(`${sub.subscription_name}: CI missing`);
          console.log('');
          continue;
        }

        const subCI = subscriptions[0];
        const subscriptionSysId = subCI.sys_id?.value || subCI.sys_id;
        console.log(`  ✅ CI found (sys_id: ${subscriptionSysId})`);
        results.cisFound++;

        // Verify metadata
        const objectId = subCI.object_id?.value || subCI.object_id || '';
        const correlationId = subCI.correlation_id?.value || subCI.correlation_id || '';

        if (objectId === tenant.tenant_id) {
          console.log(`     ✅ Tenant ID stored correctly: ${objectId}`);
          results.metadataCorrect++;
        } else {
          console.log(`     ⚠️  Tenant ID mismatch: expected ${tenant.tenant_id}, got ${objectId}`);
          results.metadataIncorrect++;
          results.issues.push(`${sub.subscription_name}: Tenant ID mismatch`);
        }

        if (correlationId === sub.subscription_id || correlationId.includes('PLACEHOLDER')) {
          console.log(`     ✅ Subscription ID stored: ${correlationId}`);
        } else {
          console.log(`     ⚠️  Subscription ID unexpected: ${correlationId}`);
        }

        // Verify Service Offering relationship
        if (serviceOfferingSysId) {
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
              console.log(`     ✅ Linked to Service Offering`);
              results.soRelationsFound++;
            } else {
              console.log(`     ❌ NOT linked to Service Offering`);
              results.soRelationsMissing++;
              results.issues.push(`${sub.subscription_name}: Missing Service Offering link`);
            }
          }
        }

        // Verify Application Service relationship (if configured)
        if (sub.link_to_application_service) {
          const appQuery = encodeURIComponent(`name=${sub.link_to_application_service}`);
          const appUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${appQuery}&sysparm_limit=1&sysparm_fields=sys_id`;

          const appResponse = await fetch(appUrl, {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
          });

          if (appResponse.ok) {
            const appData = await appResponse.json();
            const appServices = appData.result || [];

            if (appServices.length > 0) {
              const appServiceSysId = appServices[0].sys_id;

              const appRelQuery = encodeURIComponent(
                `parent=${subscriptionSysId}^child=${appServiceSysId}^type.name=Depends on::Used by`
              );
              const appRelCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${appRelQuery}&sysparm_limit=1`;

              const appRelCheckResponse = await fetch(appRelCheckUrl, {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
              });

              if (appRelCheckResponse.ok) {
                const appRelCheckData = await appRelCheckResponse.json();
                const appExisting = appRelCheckData.result || [];

                if (appExisting.length > 0) {
                  console.log(`     ✅ Linked to Application Service: ${sub.link_to_application_service}`);
                  results.appRelationsFound++;
                } else {
                  console.log(`     ❌ NOT linked to Application Service: ${sub.link_to_application_service}`);
                  results.appRelationsMissing++;
                  results.issues.push(`${sub.subscription_name}: Missing App Service link`);
                }
              }
            } else {
              console.log(`     ⚠️  Application Service not found: ${sub.link_to_application_service}`);
            }
          }
        }

        console.log('');
      }
    }

    // Summary
    console.log('='.repeat(70));
    console.log('📊 Verification Summary');
    console.log('='.repeat(70));
    console.log('');

    const totalSubs = config.tenants.reduce((sum, t) => sum + t.subscriptions.length, 0);

    console.log('Subscription CIs:');
    console.log(`  ✅ Found: ${results.cisFound}/${totalSubs}`);
    if (results.cisMissing > 0) {
      console.log(`  ❌ Missing: ${results.cisMissing}`);
    }
    console.log('');

    console.log('Metadata:');
    console.log(`  ✅ Correct: ${results.metadataCorrect}`);
    if (results.metadataIncorrect > 0) {
      console.log(`  ❌ Incorrect: ${results.metadataIncorrect}`);
    }
    console.log('');

    console.log('Service Offering Links:');
    console.log(`  ✅ Found: ${results.soRelationsFound}/${results.cisFound}`);
    if (results.soRelationsMissing > 0) {
      console.log(`  ❌ Missing: ${results.soRelationsMissing}`);
    }
    console.log('');

    const subsWithAppService = config.tenants.flatMap(t => t.subscriptions).filter(s => s.link_to_application_service).length;
    if (subsWithAppService > 0) {
      console.log('Application Service Links:');
      console.log(`  ✅ Found: ${results.appRelationsFound}/${subsWithAppService}`);
      if (results.appRelationsMissing > 0) {
        console.log(`  ❌ Missing: ${results.appRelationsMissing}`);
      }
      console.log('');
    }

    if (results.issues.length > 0) {
      console.log('❌ Issues Found:');
      for (const issue of results.issues) {
        console.log(`  - ${issue}`);
      }
      console.log('');
    }

    console.log('─'.repeat(70));

    const allVerified = results.cisMissing === 0 &&
                       results.soRelationsMissing === 0 &&
                       results.appRelationsMissing === 0 &&
                       results.metadataIncorrect === 0;

    if (allVerified) {
      console.log('✅ ALL VERIFIED - Azure CI structure is complete!');
      console.log('');
      console.log('View in ServiceNow:');
      console.log('  1. Navigate to: CMDB > Configuration > Azure Subscriptions');
      console.log('  2. Open any subscription');
      console.log('  3. Check "CI Relationships" tab');
      console.log('  4. Verify parent Service Offering and child Application Services');
    } else {
      console.log('❌ VERIFICATION FAILED - Issues found');
      console.log('');
      console.log('Next Steps:');
      if (results.cisMissing > 0) {
        console.log('  1. Create missing CIs:');
        console.log(`     npx tsx scripts/create-azure-subscription-cis.ts ${configPath}`);
      }
      if (results.soRelationsMissing > 0 || results.appRelationsMissing > 0) {
        console.log('  2. Create missing relationships:');
        console.log(`     npx tsx scripts/link-azure-subscriptions-to-services.ts ${configPath}`);
      }
    }

    console.log('');

    if (!allVerified) {
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Verification failed:');
    console.error(error);
    process.exit(1);
  }
}

const configPath = process.argv[2];

if (!configPath) {
  console.error('❌ Usage: npx tsx scripts/verify-azure-ci-structure.ts <config-file.json>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/verify-azure-ci-structure.ts config/azure/altus-azure-structure.json');
  process.exit(1);
}

verifyAzureStructure(configPath)
  .catch(console.error)
  .finally(() => process.exit(0));
