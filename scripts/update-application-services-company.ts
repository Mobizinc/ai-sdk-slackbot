/**
 * Update Application Services Company Field (ADMIN-ONLY)
 *
 * Updates all 11 existing Altus Health Application Services to link them
 * to the customer account via the company field.
 *
 * Customer: Altus Community Healthcare (ACCT0010145)
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

const applicationServices = [
  'Altus Health - NextGen Production',
  'Altus Health - Novarad Production',
  'Altus Health - Epowerdocs (EPD) Production',
  'Altus Health - TSheet Account',
  'Altus Health - Qgenda Account',
  'Altus Health - Paylocity Account',
  'Altus Health - Availity Account',
  'Altus Health - O365 Production',
  'Altus Health - Azure Environment',
  'Altus Health - Corporate Fileshares',
  'Altus Health - Vonage UCaaS',
];

async function updateApplicationServicesCompany() {
  console.log('🔄 Update Application Services Company Field - DEV');
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
    // Step 1: Query Customer Account
    // ========================================
    console.log('Step 1: Lookup Customer Account');
    console.log('─'.repeat(70));

    const customerQueryUrl = `${devUrl}/api/now/table/customer_account?sysparm_query=${encodeURIComponent('number=ACCT0010145')}&sysparm_limit=1`;

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
      console.error('❌ Customer Account "ACCT0010145" (Altus Community Healthcare) not found');
      process.exit(1);
    }

    const customerSysId = customerData.result[0].sys_id;
    const customerName = customerData.result[0].name;
    console.log(`✅ Found: "${customerName}"`);
    console.log(`   Number: ACCT0010145`);
    console.log(`   sys_id: ${customerSysId}`);
    console.log('');

    // ========================================
    // Step 2: Update Application Services
    // ========================================
    console.log('Step 2: Update Application Services');
    console.log('─'.repeat(70));

    let updatedCount = 0;
    let alreadySetCount = 0;
    let notFoundCount = 0;

    for (const serviceName of applicationServices) {
      // Query for the service
      const queryUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(`name=${serviceName}`)}&sysparm_limit=1`;

      const queryResponse = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!queryResponse.ok) {
        notFoundCount++;
        console.log(`❌ ${serviceName} - QUERY FAILED`);
        continue;
      }

      const queryData = await queryResponse.json();

      if (!queryData.result || queryData.result.length === 0) {
        notFoundCount++;
        console.log(`❌ ${serviceName} - NOT FOUND`);
        continue;
      }

      const service = queryData.result[0];
      const serviceSysId = service.sys_id;

      // Check if company is already set
      if (service.company && service.company === customerSysId) {
        alreadySetCount++;
        console.log(`✅ ${serviceName} - already set`);
        continue;
      }

      // Update the service
      const updateUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered/${serviceSysId}`;
      const payload = {
        company: customerSysId,
      };

      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.log(`❌ ${serviceName} - UPDATE FAILED`);
        console.log(`   Error: ${errorText}`);
        continue;
      }

      updatedCount++;
      console.log(`✨ ${serviceName} - updated`);
      console.log(`   sys_id: ${serviceSysId}`);
      console.log(`   company: ${customerName} (${customerSysId})`);
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Application Services: ${applicationServices.length} total`);
    console.log(`     - Already set: ${alreadySetCount}`);
    console.log(`     - Updated: ${updatedCount}`);
    console.log(`     - Not found: ${notFoundCount}`);
    console.log('');
    console.log(`✅ Company field update complete!`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Update failed:');
    console.error(error);
    process.exit(1);
  }
}

updateApplicationServicesCompany()
  .catch(console.error)
  .finally(() => process.exit(0));
