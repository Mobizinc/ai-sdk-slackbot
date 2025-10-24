/**
 * Restructure Helpdesk Service Offerings Script (ADMIN-ONLY)
 *
 * Changes the Service Offering structure from 5 to 6 offerings:
 * - Deletes: "Helpdesk and Endpoint Support" (single offering)
 * - Creates: "Helpdesk and Endpoint Support - 24/7"
 * - Creates: "Helpdesk and Endpoint Support - Standard Business Hours"
 *
 * Both new offerings are children of "Managed Support Services"
 *
 * This script is idempotent - safe to run multiple times.
 *
 * Target: DEV environment (mobizdev.service-now.com)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function restructureHelpdeskOfferings() {
  console.log('🔄 Restructure Helpdesk Service Offerings - DEV');
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
    // Step 1: Query Managed Support Services (parent)
    // ========================================
    console.log('Step 1: Lookup Parent Business Service');
    console.log('─'.repeat(70));

    const parentQueryUrl = `${devUrl}/api/now/table/cmdb_ci_service_business?sysparm_query=${encodeURIComponent('name=Managed Support Services')}&sysparm_limit=1`;

    const parentResponse = await fetch(parentQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!parentResponse.ok) {
      throw new Error(`Failed to query parent Business Service: ${parentResponse.status}`);
    }

    const parentData = await parentResponse.json();

    if (!parentData.result || parentData.result.length === 0) {
      console.error('❌ Parent Business Service "Managed Support Services" not found');
      console.error('   Run the setup script first: npx tsx scripts/setup-service-portfolio.ts');
      process.exit(1);
    }

    const parentSysId = parentData.result[0].sys_id;
    console.log('✅ Found: "Managed Support Services"');
    console.log(`   sys_id: ${parentSysId}`);
    console.log('');

    // ========================================
    // Step 2: Delete Old Service Offering
    // ========================================
    console.log('Step 2: Delete Old Service Offering');
    console.log('─'.repeat(70));

    const oldOfferingName = 'Helpdesk and Endpoint Support';
    const oldQueryUrl = `${devUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${oldOfferingName}`)}&sysparm_limit=1`;

    const oldQueryResponse = await fetch(oldQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!oldQueryResponse.ok) {
      throw new Error(`Failed to query old Service Offering: ${oldQueryResponse.status}`);
    }

    const oldQueryData = await oldQueryResponse.json();

    if (oldQueryData.result && oldQueryData.result.length > 0) {
      const oldSysId = oldQueryData.result[0].sys_id;
      console.log(`⚠️  Found: "${oldOfferingName}"`);
      console.log(`   sys_id: ${oldSysId}`);
      console.log('   Deleting...');

      const deleteUrl = `${devUrl}/api/now/table/service_offering/${oldSysId}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        throw new Error(`Failed to delete Service Offering: ${deleteResponse.status}\n${errorText}`);
      }

      console.log('✅ Deleted successfully');
    } else {
      console.log(`✅ Old offering "${oldOfferingName}" not found (already deleted or never created)`);
    }

    console.log('');

    // ========================================
    // Step 3: Create Two New Service Offerings
    // ========================================
    console.log('Step 3: Create Two New Service Offerings');
    console.log('─'.repeat(70));

    const newOfferings = [
      {
        name: 'Helpdesk and Endpoint Support - 24/7',
        description: 'Around-the-clock helpdesk and endpoint support services',
      },
      {
        name: 'Helpdesk and Endpoint Support - Standard Business Hours',
        description: 'Helpdesk and endpoint support during standard business hours',
      },
    ];

    let createdCount = 0;
    let foundCount = 0;

    for (const offering of newOfferings) {
      // Check if offering exists
      const queryUrl = `${devUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offering.name}`)}&sysparm_limit=1`;

      const queryResponse = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!queryResponse.ok) {
        throw new Error(`Failed to query Service Offering: ${queryResponse.status}`);
      }

      const queryData = await queryResponse.json();

      if (queryData.result && queryData.result.length > 0) {
        // Offering already exists
        foundCount++;
        const sysId = queryData.result[0].sys_id;
        console.log(`✅ Found: "${offering.name}"`);
        console.log(`   sys_id: ${sysId}`);
      } else {
        // Create new offering
        const createUrl = `${devUrl}/api/now/table/service_offering`;
        const payload = {
          name: offering.name,
          short_description: offering.description,
          parent: parentSysId, // Link to "Managed Support Services"
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
          throw new Error(`Failed to create Service Offering: ${createResponse.status}\n${errorText}`);
        }

        const createData = await createResponse.json();
        createdCount++;
        console.log(`✨ Created: "${offering.name}"`);
        console.log(`   sys_id: ${createData.result.sys_id}`);
        console.log(`   parent: Managed Support Services (${parentSysId})`);
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Deleted: 1 old Service Offering`);
    console.log(`   New Offerings: ${newOfferings.length} total`);
    console.log(`     - Found existing: ${foundCount}`);
    console.log(`     - Created new: ${createdCount}`);
    console.log('');
    console.log('✅ Service Offering restructure complete!');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Create Endpoint Management Platform Application Service');
    console.log('  2. Link platform to both Helpdesk offerings via svc_ci_assoc');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Restructure failed:');
    console.error(error);
    process.exit(1);
  }
}

restructureHelpdeskOfferings()
  .catch(console.error)
  .finally(() => process.exit(0));
