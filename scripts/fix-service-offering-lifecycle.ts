/**
 * Fix Service Offering Lifecycle Status
 *
 * Updates all 6 Service Offerings to have lifecycle = "Active"
 * This ensures they show up properly in ServiceNow forms and are available for selection.
 *
 * Run against UAT: UAT_SERVICENOW_URL=... npx tsx scripts/fix-service-offering-lifecycle.ts
 * Run against PROD: npx tsx scripts/fix-service-offering-lifecycle.ts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const isUAT = !!process.env.UAT_SERVICENOW_URL;

// Determine which instance to use
const instanceUrl = isUAT
  ? process.env.UAT_SERVICENOW_URL
  : (process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL);
const username = isUAT
  ? process.env.UAT_SERVICENOW_USERNAME
  : process.env.SERVICENOW_USERNAME;
const password = isUAT
  ? process.env.UAT_SERVICENOW_PASSWORD
  : process.env.SERVICENOW_PASSWORD;

if (!instanceUrl || !username || !password) {
  console.error('❌ ServiceNow credentials not configured');
  console.error('');
  console.error('For UAT:  Set UAT_SERVICENOW_URL, UAT_SERVICENOW_USERNAME, UAT_SERVICENOW_PASSWORD');
  console.error('For PROD: Set SERVICENOW_INSTANCE_URL, SERVICENOW_USERNAME, SERVICENOW_PASSWORD');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function fixServiceOfferingLifecycle() {
  const env = isUAT ? 'UAT' : 'PROD';
  console.log(`🔧 Fixing Service Offering Lifecycle Status in ${env}`);
  console.log('='.repeat(80));
  console.log('');
  console.log(`Instance: ${instanceUrl}`);
  console.log(`Username: ${username}`);
  console.log('');

  const offeringNames = [
    'Infrastructure and Cloud Management',
    'Network Management',
    'Cybersecurity Management',
    'Helpdesk and Endpoint Support - 24/7',
    'Helpdesk and Endpoint - Standard',
    'Application Administration',
  ];

  let updatedCount = 0;
  let alreadyActiveCount = 0;
  let notFoundCount = 0;

  console.log('Checking and updating lifecycle status for each Service Offering...');
  console.log('─'.repeat(80));
  console.log('');

  for (const offeringName of offeringNames) {
    // Query for this Service Offering
    const query = encodeURIComponent(`name=${offeringName}`);
    const fields = 'sys_id,name,service_status,install_status';
    const queryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${query}&sysparm_display_value=all&sysparm_fields=${fields}&sysparm_limit=1`;

    try {
      const queryResponse = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!queryResponse.ok) {
        console.error(`❌ Error querying "${offeringName}": ${queryResponse.status}`);
        continue;
      }

      const queryData = await queryResponse.json();

      if (!queryData.result || queryData.result.length === 0) {
        console.log(`❌ NOT FOUND: "${offeringName}"`);
        notFoundCount++;
        console.log('');
        continue;
      }

      const offering = queryData.result[0];
      const sys_id = offering.sys_id?.value || offering.sys_id || '';
      const currentStatus = offering.service_status?.display_value || offering.service_status || '(not set)';

      console.log(`"${offeringName}"`);
      console.log(`  sys_id: ${sys_id}`);
      console.log(`  Current Service Status: ${currentStatus}`);

      // Check if already Operational
      if (currentStatus === 'Operational' || currentStatus === 'operational') {
        console.log('  ✅ Already Operational - no update needed');
        alreadyActiveCount++;
        console.log('');
        continue;
      }

      // Update to Active
      console.log('  🔧 Updating to Active...');

      const updateUrl = `${instanceUrl}/api/now/table/service_offering/${sys_id}`;
      const updatePayload = {
        service_status: 'operational', // operational = Active/In Use
      };

      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error(`  ❌ Failed to update: ${updateResponse.status}`);
        console.error(`     ${errorText}`);
        console.log('');
        continue;
      }

      const updateData = await updateResponse.json();
      const newStatus = updateData.result.service_status?.display_value || updateData.result.service_status || '(unknown)';

      console.log(`  ✅ Updated to: ${newStatus}`);
      updatedCount++;
      console.log('');

    } catch (error) {
      console.error(`❌ Error processing "${offeringName}":`, error);
      console.log('');
    }
  }

  // ========================================
  // Summary Report
  // ========================================
  console.log('─'.repeat(80));
  console.log('📊 Summary');
  console.log('─'.repeat(80));
  console.log('');

  console.log(`Service Offerings checked: ${offeringNames.length}`);
  console.log(`  ✅ Already Operational: ${alreadyActiveCount}`);
  console.log(`  🔧 Updated to Operational: ${updatedCount}`);
  if (notFoundCount > 0) {
    console.log(`  ❌ Not Found: ${notFoundCount}`);
  }
  console.log('');

  if (updatedCount > 0) {
    console.log('✅ Service status has been updated successfully');
    console.log('');
    console.log('All Service Offerings should now be "Operational" and available for use.');
    console.log('');
  } else if (alreadyActiveCount === offeringNames.length) {
    console.log('✅ All Service Offerings were already set to Operational');
    console.log('');
  } else {
    console.error('⚠️  Some Service Offerings may need manual attention');
    console.log('');
  }
}

fixServiceOfferingLifecycle()
  .catch((error) => {
    console.error('');
    console.error('❌ Script failed:', error);
    console.error('');
    process.exit(1);
  });
