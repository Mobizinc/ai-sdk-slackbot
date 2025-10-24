/**
 * STEP 3 (OPTIONAL): Create Endpoint Management Platform Application Service (ADMIN-ONLY)
 *
 * Creates 1 Application Service and links it to 2 Service Offerings:
 * - Application Service: "Altus Health - Endpoint Management Platform"
 * - Links to: "Helpdesk and Endpoint Support - 24/7"
 * - Links to: "Helpdesk and Endpoint Support - Standard Business Hours"
 *
 * This demonstrates the CSDM principle of separating technical services
 * from business commitments using many-to-many relationships.
 *
 * PREREQUISITES:
 * - Run Step 1: setup-service-portfolio.ts first
 * - Run Step 2: setup-altus-application-services.ts first
 * - Both Helpdesk Service Offerings must exist
 * - Customer account must exist in ServiceNow
 *
 * ENVIRONMENT VARIABLES:
 * - CUSTOMER_ACCOUNT_NUMBER: Account number (default: ACCT0010145 for Altus)
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * This script is idempotent - safe to run multiple times.
 *
 * Target: Any environment (DEV or PROD)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function createEndpointPlatform() {
  console.log('🏗️  STEP 3: Create Endpoint Management Platform');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (support both PROD and DEV env vars)
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;
  const customerAccountNumber = process.env.CUSTOMER_ACCOUNT_NUMBER || 'ACCT0010145';

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables (use either PROD or DEV prefix):');
    console.log('  - SERVICENOW_URL or DEV_SERVICENOW_URL');
    console.log('  - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD');
    console.log('\nOptional:');
    console.log('  - CUSTOMER_ACCOUNT_NUMBER (default: ACCT0010145)');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log('Configuration:');
  console.log(`  Environment: ${environment}`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log(`  Customer Account: ${customerAccountNumber}`);
  console.log('');

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // ========================================
    // Step 1: Query Customer Account (Altus)
    // ========================================
    console.log('Step 1: Lookup Customer Account');
    console.log('─'.repeat(70));

    const customerQueryUrl = `${instanceUrl}/api/now/table/customer_account?sysparm_query=${encodeURIComponent(`number=${customerAccountNumber}`)}&sysparm_limit=1`;

    const customerResponse = await fetch(customerQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!customerResponse.ok) {
      throw new Error(`Failed to query customer account: ${customerResponse.status}`);
    }

    const customerData = await customerResponse.json();

    if (!customerData.result || customerData.result.length === 0) {
      console.error(`❌ Customer Account "${customerAccountNumber}" not found`);
      console.error('   Please ensure the customer account exists in ServiceNow');
      process.exit(1);
    }

    const customerSysId = customerData.result[0].sys_id;
    const customerName = customerData.result[0].name;
    console.log(`✅ Found: "${customerName}"`);
    console.log(`   Number: ${customerAccountNumber}`);
    console.log(`   sys_id: ${customerSysId}`);
    console.log('');

    // ========================================
    // Step 2: Query Both Service Offerings
    // ========================================
    console.log('Step 2: Lookup Service Offerings');
    console.log('─'.repeat(70));

    const offeringNames = [
      'Helpdesk and Endpoint Support - 24/7',
      'Helpdesk and Endpoint Support - Standard Business Hours',
    ];

    const offeringSysIds: Map<string, string> = new Map();

    for (const offeringName of offeringNames) {
      const queryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offeringName}`)}&sysparm_limit=1`;

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to query Service Offering "${offeringName}": ${response.status}`);
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        console.error(`❌ Service Offering not found: "${offeringName}"`);
        console.error('   Run the setup script first: npx tsx scripts/restructure-helpdesk-offerings.ts');
        process.exit(1);
      }

      const sysId = data.result[0].sys_id;
      offeringSysIds.set(offeringName, sysId);
      console.log(`✅ Found: "${offeringName}"`);
      console.log(`   sys_id: ${sysId}`);
    }

    console.log('');

    // ========================================
    // Step 3: Create Application Service
    // ========================================
    console.log('Step 3: Create Application Service');
    console.log('─'.repeat(70));

    const appServiceName = 'Altus Health - Endpoint Management Platform';
    let appServiceSysId: string;

    // Check if Application Service exists
    const appServiceQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(`name=${appServiceName}`)}&sysparm_limit=1`;

    const appServiceQueryResponse = await fetch(appServiceQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!appServiceQueryResponse.ok) {
      throw new Error(`Failed to query Application Service: ${appServiceQueryResponse.status}`);
    }

    const appServiceQueryData = await appServiceQueryResponse.json();

    if (appServiceQueryData.result && appServiceQueryData.result.length > 0) {
      // Application Service already exists
      appServiceSysId = appServiceQueryData.result[0].sys_id;
      console.log(`✅ Found: "${appServiceName}"`);
      console.log(`   sys_id: ${appServiceSysId}`);
    } else {
      // Create new Application Service
      const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered`;
      const payload = {
        name: appServiceName,
        short_description: 'Dedicated Instance - Endpoint management platform (Intune)',
        operational_status: '1', // Operational
        company: customerSysId, // Altus Community Healthcare
      };

      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create Application Service: ${createResponse.status}\n${errorText}`);
      }

      const createData = await createResponse.json();
      appServiceSysId = createData.result.sys_id;
      console.log(`✨ Created: "${appServiceName}"`);
      console.log(`   sys_id: ${appServiceSysId}`);
      console.log(`   customer: ${customerName} (${customerSysId})`);
      console.log(`   status: Operational`);
    }

    console.log('');

    // ========================================
    // Step 4: Create Many-to-Many Relationships
    // ========================================
    console.log('Step 4: Create Service Dependencies (svc_ci_assoc)');
    console.log('─'.repeat(70));

    let createdCount = 0;
    let foundCount = 0;

    for (const [offeringName, offeringSysId] of offeringSysIds.entries()) {
      // Check if relationship exists
      const assocQueryUrl = `${instanceUrl}/api/now/table/svc_ci_assoc?sysparm_query=${encodeURIComponent(`parent=${offeringSysId}^child=${appServiceSysId}`)}&sysparm_limit=1`;

      const assocQueryResponse = await fetch(assocQueryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!assocQueryResponse.ok) {
        throw new Error(`Failed to query svc_ci_assoc: ${assocQueryResponse.status}`);
      }

      const assocQueryData = await assocQueryResponse.json();

      if (assocQueryData.result && assocQueryData.result.length > 0) {
        // Relationship already exists
        foundCount++;
        const sysId = assocQueryData.result[0].sys_id;
        console.log(`✅ Found: ${offeringName} → Endpoint Platform`);
        console.log(`   sys_id: ${sysId}`);
      } else {
        // Create new relationship
        const assocCreateUrl = `${instanceUrl}/api/now/table/svc_ci_assoc`;
        const assocPayload = {
          parent: offeringSysId, // Service Offering
          child: appServiceSysId, // Application Service
        };

        const assocCreateResponse = await fetch(assocCreateUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(assocPayload),
        });

        if (!assocCreateResponse.ok) {
          const errorText = await assocCreateResponse.text();
          throw new Error(`Failed to create svc_ci_assoc: ${assocCreateResponse.status}\n${errorText}`);
        }

        const assocCreateData = await assocCreateResponse.json();
        createdCount++;
        console.log(`✨ Created: ${offeringName} → Endpoint Platform`);
        console.log(`   sys_id: ${assocCreateData.result.sys_id}`);
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Application Service: 1 (${appServiceName})`);
    console.log(`   Service Dependencies: ${offeringNames.length} total`);
    console.log(`     - Found existing: ${foundCount}`);
    console.log(`     - Created new: ${createdCount}`);
    console.log('');
    console.log('   Architecture:');
    console.log('     Service Offering: "Helpdesk... 24/7" ──┐');
    console.log('                                            ├─→ "Endpoint Platform"');
    console.log('     Service Offering: "Helpdesk... Hours"──┘');
    console.log('');
    console.log('✅ Endpoint Management Platform setup complete!');
    console.log('');
    console.log('Final State:');
    console.log('  - 6 Service Offerings (including 2 Helpdesk offerings)');
    console.log('  - 12 Application Services (including Endpoint Platform)');
    console.log('  - 1 platform supporting 2 business commitments');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:');
    console.error(error);
    process.exit(1);
  }
}

createEndpointPlatform()
  .catch(console.error)
  .finally(() => process.exit(0));
