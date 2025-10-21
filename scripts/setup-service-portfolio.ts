/**
 * STEP 1: ServiceNow Service Portfolio Setup Script (ADMIN-ONLY)
 * Creates MSP service portfolio (Business Service + Service Offerings + CI Relationships)
 *
 * This script is idempotent - safe to run multiple times.
 * It creates records only if they don't already exist.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * Portfolio Structure:
 * - Business Service: "Managed Support Services"
 * - Service Offerings (6):
 *   1. Infrastructure and Cloud Management
 *   2. Network Management
 *   3. Cybersecurity Management
 *   4. Helpdesk and Endpoint Support - 24/7
 *   5. Helpdesk and Endpoint - Standard
 *   6. Application Administration
 * - CI Relationships: Business Service → Service Offerings (6 relationships)
 *
 * Target: Any environment (DEV or PROD)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function setupServicePortfolio() {
  console.log('🏗️  STEP 1: ServiceNow Service Portfolio Setup');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (support both PROD and DEV env vars)
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables (use either PROD or DEV prefix):');
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

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // ========================================
    // Phase 1: Create/Find Business Service
    // ========================================
    console.log('Phase 1: Business Service');
    console.log('─'.repeat(70));

    const businessServiceName = 'Managed Support Services';

    // Check if Business Service exists
    const bsQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_business?sysparm_query=${encodeURIComponent(`name=${businessServiceName}`)}&sysparm_limit=1`;

    const bsQueryResponse = await fetch(bsQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!bsQueryResponse.ok) {
      throw new Error(`Failed to query Business Service: ${bsQueryResponse.status}`);
    }

    const bsQueryData = await bsQueryResponse.json();
    let businessServiceSysId: string;

    if (bsQueryData.result && bsQueryData.result.length > 0) {
      // Business Service already exists
      businessServiceSysId = bsQueryData.result[0].sys_id;
      console.log(`✅ Found existing Business Service: "${businessServiceName}"`);
      console.log(`   sys_id: ${businessServiceSysId}`);
    } else {
      // Create new Business Service
      const bsCreateUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_business`;
      const bsPayload = {
        name: businessServiceName,
        short_description: 'Global MSP service portfolio for managed support services',
        vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT
      };

      const bsCreateResponse = await fetch(bsCreateUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bsPayload),
      });

      if (!bsCreateResponse.ok) {
        throw new Error(`Failed to create Business Service: ${bsCreateResponse.status}\n${await bsCreateResponse.text()}`);
      }

      const bsCreateData = await bsCreateResponse.json();
      businessServiceSysId = bsCreateData.result.sys_id;
      console.log(`✨ Created new Business Service: "${businessServiceName}"`);
      console.log(`   sys_id: ${businessServiceSysId}`);
    }

    console.log('');

    // ========================================
    // Phase 2: Create/Find Service Offerings
    // ========================================
    console.log('Phase 2: Service Offerings');
    console.log('─'.repeat(70));

    const offeringNames = [
      'Infrastructure and Cloud Management',
      'Network Management',
      'Cybersecurity Management',
      'Helpdesk and Endpoint Support - 24/7',
      'Helpdesk and Endpoint - Standard',
      'Application Administration',
    ];

    let createdCount = 0;
    let foundCount = 0;

    for (const offeringName of offeringNames) {
      // Add delay between operations to help auto-numbering settle
      if (createdCount > 0) {
        console.log('   Waiting 2 seconds for numbering system...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      // Check if Service Offering exists
      const soQueryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offeringName}`)}&sysparm_limit=1`;

      const soQueryResponse = await fetch(soQueryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!soQueryResponse.ok) {
        throw new Error(`Failed to query Service Offering: ${soQueryResponse.status}`);
      }

      const soQueryData = await soQueryResponse.json();

      if (soQueryData.result && soQueryData.result.length > 0) {
        // Service Offering already exists
        foundCount++;
        const sysId = soQueryData.result[0].sys_id;
        console.log(`✅ Found: "${offeringName}"`);
        console.log(`   sys_id: ${sysId}`);
      } else {
        // Create new Service Offering
        const soCreateUrl = `${instanceUrl}/api/now/table/service_offering`;
        const soPayload = {
          name: offeringName,
          parent: businessServiceSysId, // Link to Business Service
          vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT
        };

        const soCreateResponse = await fetch(soCreateUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(soPayload),
        });

        if (!soCreateResponse.ok) {
          throw new Error(`Failed to create Service Offering: ${soCreateResponse.status}\n${await soCreateResponse.text()}`);
        }

        const soCreateData = await soCreateResponse.json();
        createdCount++;
        console.log(`✨ Created: "${offeringName}"`);
        console.log(`   sys_id: ${soCreateData.result.sys_id}`);
        console.log(`   parent: ${businessServiceSysId}`);
      }
    }

    console.log('');

    // ========================================
    // Phase 3: Create CI Relationships
    // ========================================
    console.log('Phase 3: CI Relationships (Business Service → Service Offerings)');
    console.log('─'.repeat(70));

    // Query all Service Offerings that are children of Business Service
    const allSoQueryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`parent=${businessServiceSysId}`)}&sysparm_fields=sys_id,name`;
    const allSoResponse = await fetch(allSoQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!allSoResponse.ok) {
      throw new Error(`Failed to query Service Offerings: ${allSoResponse.status}`);
    }

    const allSoData = await allSoResponse.json();
    let ciRelCreatedCount = 0;
    let ciRelFoundCount = 0;

    for (const so of allSoData.result) {
      // Check if CI relationship already exists
      const ciRelCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(`parent=${businessServiceSysId}^child=${so.sys_id}`)}&sysparm_limit=1`;
      const ciRelCheckResponse = await fetch(ciRelCheckUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!ciRelCheckResponse.ok) {
        console.log(`⚠️  Failed to check CI relationship for "${so.name}"`);
        continue;
      }

      const ciRelCheckData = await ciRelCheckResponse.json();

      if (ciRelCheckData.result && ciRelCheckData.result.length > 0) {
        // CI relationship already exists
        ciRelFoundCount++;
        console.log(`✅ CI Relationship exists: "${so.name}"`);
      } else {
        // Create CI relationship
        const ciRelPayload = {
          parent: businessServiceSysId,
          child: so.sys_id,
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
          ciRelCreatedCount++;
          console.log(`✨ Created CI Relationship: "${so.name}"`);
        } else {
          console.log(`❌ Failed to create CI relationship for "${so.name}"`);
        }
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Business Services: 1 (${businessServiceSysId})`);
    console.log(`   Service Offerings: ${offeringNames.length} total`);
    console.log(`     - Found existing: ${foundCount}`);
    console.log(`     - Created new: ${createdCount}`);
    console.log(`   CI Relationships: ${allSoData.result.length} total`);
    console.log(`     - Found existing: ${ciRelFoundCount}`);
    console.log(`     - Created new: ${ciRelCreatedCount}`);
    console.log('');
    console.log('✅ Portfolio setup complete!');
    console.log('');
    console.log('View in ServiceNow:');
    console.log(`${instanceUrl}/nav_to.do?uri=cmdb_ci_service_business.do?sys_id=${businessServiceSysId}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:');
    console.error(error);
    process.exit(1);
  }
}

setupServicePortfolio()
  .catch(console.error)
  .finally(() => process.exit(0));
