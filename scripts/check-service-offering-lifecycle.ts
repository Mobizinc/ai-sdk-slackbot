/**
 * Check Service Offering Lifecycle Status in UAT and PROD
 *
 * Verifies that all 6 Service Offerings have the correct lifecycle state.
 * They should be "Active" not "Requirements / Pipeline" or other states.
 *
 * Run against UAT: UAT_SERVICENOW_URL=... npx tsx scripts/check-service-offering-lifecycle.ts
 * Run against PROD: npx tsx scripts/check-service-offering-lifecycle.ts
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

async function checkServiceOfferingLifecycle() {
  const env = isUAT ? 'UAT' : 'PROD';
  console.log(`🔍 Checking Service Offering Lifecycle Status in ${env}`);
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

  const issues: Array<{
    name: string;
    sys_id: string;
    lifecycle: string;
    install_status: string;
  }> = [];

  console.log('Checking lifecycle status for each Service Offering...');
  console.log('─'.repeat(80));
  console.log('');

  for (const offeringName of offeringNames) {
    // Query for this Service Offering with service_status fields
    const query = encodeURIComponent(`name=${offeringName}`);
    const fields = 'sys_id,name,service_status,install_status,operational_status,version,parent,vendor';
    const url = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${query}&sysparm_display_value=all&sysparm_fields=${fields}&sysparm_limit=1`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`❌ Error querying "${offeringName}": ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        console.log(`❌ NOT FOUND: "${offeringName}"`);
        console.log('');
        continue;
      }

      const offering = data.result[0];
      const sys_id = offering.sys_id?.value || offering.sys_id || '';
      const serviceStatus = offering.service_status?.display_value || offering.service_status || '(not set)';
      const installStatus = offering.install_status?.display_value || offering.install_status || '(not set)';
      const operationalStatus = offering.operational_status?.display_value || offering.operational_status || '(not set)';
      const version = offering.version?.display_value || offering.version || '(not set)';

      console.log(`"${offeringName}"`);
      console.log(`  sys_id: ${sys_id}`);
      console.log(`  Service Status: ${serviceStatus}`);
      console.log(`  Install Status: ${installStatus}`);
      console.log(`  Operational Status: ${operationalStatus}`);
      console.log(`  Version: ${version}`);

      // Check if service_status is NOT "Operational"
      if (serviceStatus !== 'Operational' && serviceStatus !== 'operational') {
        console.log(`  ⚠️  WARNING: Service Status should be "Operational"`);
        issues.push({
          name: offeringName,
          sys_id: sys_id,
          lifecycle: serviceStatus,
          install_status: installStatus,
        });
      } else {
        console.log(`  ✅ Status OK`);
      }

      console.log('');
    } catch (error) {
      console.error(`❌ Error checking "${offeringName}":`, error);
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

  if (issues.length === 0) {
    console.log('✅ All Service Offerings have correct service status');
    console.log('');
    console.log('All 6 Service Offerings are set to "Operational".');
    console.log('');
  } else {
    console.error(`❌ Found ${issues.length} Service Offering(s) with incorrect service status`);
    console.log('');
    console.log('Issues:');
    issues.forEach(issue => {
      console.log(`  - "${issue.name}"`);
      console.log(`    sys_id: ${issue.sys_id}`);
      console.log(`    Current Service Status: ${issue.lifecycle}`);
      console.log(`    Expected: Operational`);
      console.log('');
    });

    console.log('To fix these issues, you can:');
    console.log('');
    console.log('1. Manually update in ServiceNow UI:');
    console.log(`   - Navigate to ${instanceUrl}/now/nav/ui/classic/params/target/service_offering_list.do`);
    console.log('   - Find each Service Offering and set Service Status to "Operational"');
    console.log('');
    console.log('2. Or run the fix script:');
    console.log(`   ${isUAT ? 'UAT_SERVICENOW_URL=... ' : ''}npx tsx scripts/fix-service-offering-lifecycle.ts`);
    console.log('');

    process.exit(1);
  }
}

checkServiceOfferingLifecycle()
  .catch((error) => {
    console.error('');
    console.error('❌ Script failed:', error);
    console.error('');
    process.exit(1);
  });
