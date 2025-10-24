/**
 * Link Altus Firewalls to Network Management Service
 *
 * Creates CI relationships linking all Altus firewalls to the "Network Management"
 * Service Offering. This establishes proper service dependencies in the CMDB.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * Relationship Structure:
 * - Parent: Network Management Service Offering
 * - Children: Altus Firewalls (29 devices)
 * - Type: "Contains::Contained by"
 *
 * This script is idempotent - safe to run multiple times.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function linkFirewallsToNetworkService() {
  console.log('🔗 Link Altus Firewalls to Network Management Service');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (support both PROD and DEV env vars)
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.log('\\nRequired variables (use either PROD or DEV prefix):');
    console.log('  - SERVICENOW_URL or DEV_SERVICENOW_URL');
    console.log('  - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log('Configuration:');
  console.log(`  Environment: ${environment}`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log('');

  if (environment === 'PRODUCTION') {
    console.log('⚠️  WARNING: Creating relationships in PRODUCTION');
    console.log('');
  }

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // ========================================
    // Phase 1: Look up Network Management Service Offering
    // ========================================
    console.log('Phase 1: Lookup Network Management Service Offering');
    console.log('─'.repeat(70));

    const serviceOfferingName = 'Network Management';
    const soQueryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${serviceOfferingName}`)}&sysparm_limit=1&sysparm_fields=sys_id,name`;

    const soResponse = await fetch(soQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!soResponse.ok) {
      throw new Error(`Failed to query Service Offering: ${soResponse.status}`);
    }

    const soData = await soResponse.json();

    if (!soData.result || soData.result.length === 0) {
      throw new Error(`Service Offering "${serviceOfferingName}" not found. Run setup-service-portfolio.ts first.`);
    }

    const serviceOfferingSysId = soData.result[0].sys_id;
    console.log(`✅ Found Service Offering: "${serviceOfferingName}"`);
    console.log(`   sys_id: ${serviceOfferingSysId}`);
    console.log('');

    // ========================================
    // Phase 2: Query Altus Firewalls
    // ========================================
    console.log('Phase 2: Query Altus Firewalls');
    console.log('─'.repeat(70));

    const firewallQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear?sysparm_query=${encodeURIComponent('nameLIKEAltus')}&sysparm_fields=sys_id,name,location&sysparm_display_value=all&sysparm_limit=100`;

    const fwResponse = await fetch(firewallQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!fwResponse.ok) {
      throw new Error(`Failed to query firewalls: ${fwResponse.status}`);
    }

    const fwData = await fwResponse.json();
    const firewalls = fwData.result || [];

    console.log(`✅ Found ${firewalls.length} Altus firewall(s)`);
    console.log('');

    if (firewalls.length === 0) {
      console.log('⚠️  No Altus firewalls found. Nothing to link.');
      process.exit(0);
    }

    // ========================================
    // Phase 3: Create CI Relationships
    // ========================================
    console.log('Phase 3: Create CI Relationships (Service Offering → Firewalls)');
    console.log('─'.repeat(70));
    console.log('');

    let ciRelCreatedCount = 0;
    let ciRelFoundCount = 0;
    let ciRelErrorCount = 0;

    for (let i = 0; i < firewalls.length; i++) {
      const fw = firewalls[i];
      const fwSysId = fw.sys_id?.value || fw.sys_id;
      const fwName = fw.name?.display_value || fw.name;
      const fwLocation = fw.location?.display_value || '(no location)';

      console.log(`[${i + 1}/${firewalls.length}] ${fwName}`);
      console.log(`   Location: ${fwLocation}`);
      console.log(`   sys_id: ${fwSysId}`);

      // Check if CI relationship already exists
      const ciRelCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(`parent=${serviceOfferingSysId}^child=${fwSysId}`)}&sysparm_limit=1`;

      const ciRelCheckResponse = await fetch(ciRelCheckUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!ciRelCheckResponse.ok) {
        console.log(`   ⚠️  Failed to check CI relationship: ${ciRelCheckResponse.status}`);
        ciRelErrorCount++;
        console.log('');
        continue;
      }

      const ciRelCheckData = await ciRelCheckResponse.json();

      if (ciRelCheckData.result && ciRelCheckData.result.length > 0) {
        // CI relationship already exists
        ciRelFoundCount++;
        console.log(`   ✅ CI Relationship already exists`);
      } else {
        // Create CI relationship
        const ciRelPayload = {
          parent: serviceOfferingSysId,
          child: fwSysId,
          type: 'Contains::Contained by',
        };

        const ciRelCreateResponse = await fetch(`${instanceUrl}/api/now/table/cmdb_rel_ci`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ciRelPayload),
        });

        if (ciRelCreateResponse.ok) {
          const ciRelCreateData = await ciRelCreateResponse.json();
          ciRelCreatedCount++;
          console.log(`   ✨ Created CI Relationship`);
          console.log(`      Relationship sys_id: ${ciRelCreateData.result.sys_id}`);
        } else {
          const errorText = await ciRelCreateResponse.text();
          console.log(`   ❌ Failed to create CI relationship: ${ciRelCreateResponse.status}`);
          console.log(`      ${errorText.substring(0, 200)}`);
          ciRelErrorCount++;
        }
      }

      console.log('');
    }

    // ========================================
    // Summary
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log('─'.repeat(70));
    console.log(`   Service Offering: ${serviceOfferingName} (${serviceOfferingSysId})`);
    console.log(`   Total Firewalls: ${firewalls.length}`);
    console.log(`   CI Relationships:`);
    console.log(`     - Found existing: ${ciRelFoundCount}`);
    console.log(`     - Created new: ${ciRelCreatedCount}`);
    console.log(`     - Errors: ${ciRelErrorCount}`);
    console.log('');

    if (ciRelCreatedCount > 0) {
      console.log(`✅ Successfully created ${ciRelCreatedCount} CI relationship(s)!`);
      console.log('');
      console.log('Next Steps:');
      console.log('  1. Verify relationships in ServiceNow:');
      console.log(`     ${instanceUrl}/nav_to.do?uri=service_offering.do?sys_id=${serviceOfferingSysId}`);
      console.log('  2. Check CI Relationship Viewer (Related Services tab)');
      console.log('  3. Verify incident routing based on firewall-service dependencies');
    } else if (ciRelFoundCount === firewalls.length) {
      console.log('ℹ️  All firewalls already linked to Network Management service');
      console.log('   No new relationships were created.');
    } else if (ciRelErrorCount > 0) {
      console.log('⚠️  Some errors occurred. Review the output above.');
    }

    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Script failed:');
    console.error(error);
    process.exit(1);
  }
}

linkFirewallsToNetworkService()
  .catch(console.error)
  .finally(() => process.exit(0));
