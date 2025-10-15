/**
 * ServiceNow Service Portfolio Setup Script (ADMIN-ONLY)
 * Creates MSP service portfolio in ServiceNow DEV environment
 *
 * This script is idempotent - safe to run multiple times.
 * It creates records only if they don't already exist.
 *
 * Portfolio Structure:
 * - Business Service: "Managed Support Services"
 * - Service Offerings (5):
 *   1. Infrastructure and Cloud Management
 *   2. Network Management
 *   3. Cybersecurity Management
 *   4. Helpdesk and Endpoint Support
 *   5. Application Administration
 *
 * Target: DEV environment (mobizdev.service-now.com)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function setupServicePortfolio() {
  console.log('🏗️  ServiceNow Service Portfolio Setup - DEV');
  console.log('='.repeat(70));
  console.log('');

  // Get DEV credentials
  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  if (!devUrl || !devUsername || !devPassword) {
    console.error('❌ DEV ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables:');
    console.log('  - DEV_SERVICENOW_URL');
    console.log('  - DEV_SERVICENOW_USERNAME');
    console.log('  - DEV_SERVICENOW_PASSWORD');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  URL: ${devUrl}`);
  console.log(`  Username: ${devUsername}`);
  console.log('');

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`;

  try {
    // ========================================
    // Phase 1: Create/Find Business Service
    // ========================================
    console.log('Phase 1: Business Service');
    console.log('─'.repeat(70));

    const businessServiceName = 'Managed Support Services';

    // Check if Business Service exists
    const bsQueryUrl = `${devUrl}/api/now/table/cmdb_ci_service_business?sysparm_query=${encodeURIComponent(`name=${businessServiceName}`)}&sysparm_limit=1`;

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
      const bsCreateUrl = `${devUrl}/api/now/table/cmdb_ci_service_business`;
      const bsPayload = {
        name: businessServiceName,
        short_description: 'Global MSP service portfolio for managed support services',
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
      'Helpdesk and Endpoint Support',
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
      const soQueryUrl = `${devUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offeringName}`)}&sysparm_limit=1`;

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
        const soCreateUrl = `${devUrl}/api/now/table/service_offering`;
        const soPayload = {
          name: offeringName,
          parent: businessServiceSysId, // Link to Business Service
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
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Business Services: 1 (${businessServiceSysId})`);
    console.log(`   Service Offerings: ${offeringNames.length} total`);
    console.log(`     - Found existing: ${foundCount}`);
    console.log(`     - Created new: ${createdCount}`);
    console.log('');
    console.log('✅ Portfolio setup complete!');
    console.log('');
    console.log('View in ServiceNow:');
    console.log(`${devUrl}/nav_to.do?uri=cmdb_ci_service_business.do?sys_id=${businessServiceSysId}`);
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
