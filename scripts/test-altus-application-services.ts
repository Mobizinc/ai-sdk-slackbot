/**
 * Altus Health Application Services Test Script
 * Tests that all 11 Application Services were created correctly in DEV environment
 *
 * Validates:
 * - All 11 Application Services exist
 * - Each has the correct parent Service Offering
 * - Parent relationships are properly established
 * - Services are distributed correctly (7+3+1)
 *
 * Target: DEV environment (mobizdev.service-now.com)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

// Override to use DEV instance
if (process.env.DEV_SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.DEV_SERVICENOW_URL;
  process.env.SERVICENOW_URL = process.env.DEV_SERVICENOW_URL;
}
if (process.env.DEV_SERVICENOW_USERNAME) {
  process.env.SERVICENOW_USERNAME = process.env.DEV_SERVICENOW_USERNAME;
}
if (process.env.DEV_SERVICENOW_PASSWORD) {
  process.env.SERVICENOW_PASSWORD = process.env.DEV_SERVICENOW_PASSWORD;
}

interface ExpectedService {
  name: string;
  parentOffering: string;
}

const expectedServices: ExpectedService[] = [
  // Application Administration (7)
  { name: 'Altus Health - NextGen Production', parentOffering: 'Application Administration' },
  { name: 'Altus Health - Novarad Production', parentOffering: 'Application Administration' },
  { name: 'Altus Health - Epowerdocs (EPD) Production', parentOffering: 'Application Administration' },
  { name: 'Altus Health - TSheet Account', parentOffering: 'Application Administration' },
  { name: 'Altus Health - Qgenda Account', parentOffering: 'Application Administration' },
  { name: 'Altus Health - Paylocity Account', parentOffering: 'Application Administration' },
  { name: 'Altus Health - Availity Account', parentOffering: 'Application Administration' },

  // Infrastructure and Cloud Management (3)
  { name: 'Altus Health - O365 Production', parentOffering: 'Infrastructure and Cloud Management' },
  { name: 'Altus Health - Azure Environment', parentOffering: 'Infrastructure and Cloud Management' },
  { name: 'Altus Health - Corporate Fileshares', parentOffering: 'Infrastructure and Cloud Management' },

  // Network Management (1)
  { name: 'Altus Health - Vonage UCaaS', parentOffering: 'Network Management' },
];

async function testAltusApplicationServices() {
  console.log('🧪 Altus Health Application Services Test');
  console.log('='.repeat(70));
  console.log('');

  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  if (!devUrl || !devUsername || !devPassword) {
    console.error('❌ DEV ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`;

  try {
    // ========================================
    // Step 1: Query Service Offerings
    // ========================================
    console.log('Step 1: Loading Service Offering sys_ids');
    console.log('─'.repeat(70));

    const offeringNames = [
      'Application Administration',
      'Infrastructure and Cloud Management',
      'Network Management',
    ];

    const offeringSysIds: Map<string, string> = new Map();

    for (const offeringName of offeringNames) {
      const queryUrl = `${devUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offeringName}`)}&sysparm_limit=1&sysparm_display_value=all`;

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to query Service Offering: ${response.status}`);
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        console.error(`❌ Service Offering not found: "${offeringName}"`);
        process.exit(1);
      }

      const sysId = typeof data.result[0].sys_id === 'object'
        ? data.result[0].sys_id.value
        : data.result[0].sys_id;

      offeringSysIds.set(offeringName, sysId);
      console.log(`✅ ${offeringName}: ${sysId}`);
    }

    console.log('');

    // ========================================
    // Step 2: Validate All Application Services
    // ========================================
    console.log('Step 2: Validating Application Services');
    console.log('─'.repeat(70));

    let successCount = 0;
    let failureCount = 0;
    const failures: string[] = [];

    for (const expectedService of expectedServices) {
      const queryUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(`name=${expectedService.name}`)}&sysparm_limit=1&sysparm_display_value=all`;

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        failureCount++;
        failures.push(`Query failed for "${expectedService.name}"`);
        console.log(`❌ ${expectedService.name} - QUERY FAILED`);
        continue;
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        failureCount++;
        failures.push(`Not found: "${expectedService.name}"`);
        console.log(`❌ ${expectedService.name} - NOT FOUND`);
        continue;
      }

      const service = data.result[0];

      // Extract parent sys_id (handle object format)
      let parentSysId: string;
      if (typeof service.parent === 'object') {
        parentSysId = service.parent.value || '';
      } else {
        parentSysId = service.parent || '';
      }

      // Validate parent
      const expectedParentSysId = offeringSysIds.get(expectedService.parentOffering);

      if (parentSysId !== expectedParentSysId) {
        failureCount++;
        failures.push(`Wrong parent for "${expectedService.name}"`);
        console.log(`⚠️  ${expectedService.name} - WRONG PARENT`);
        console.log(`   Expected: ${expectedParentSysId}`);
        console.log(`   Got: ${parentSysId}`);
      } else {
        successCount++;
        console.log(`✅ ${expectedService.name}`);
      }
    }

    console.log('');

    // ========================================
    // Step 3: Summary by Service Offering
    // ========================================
    console.log('Step 3: Distribution by Service Offering');
    console.log('─'.repeat(70));

    for (const offeringName of offeringNames) {
      const count = expectedServices.filter(s => s.parentOffering === offeringName).length;
      console.log(`  ${offeringName}: ${count} services`);
    }

    console.log('');

    // ========================================
    // Final Results
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 Test Results:');
    console.log(`   Expected: ${expectedServices.length} Application Services`);
    console.log(`   Found: ${successCount}`);
    console.log(`   Missing/Invalid: ${failureCount}`);
    console.log('');

    if (failureCount > 0) {
      console.error('❌ TEST FAILED');
      console.error('');
      console.error('Failures:');
      failures.forEach(f => console.error(`  - ${f}`));
      console.error('');
      console.error('Run the setup script: npx tsx scripts/setup-altus-application-services.ts');
      process.exit(1);
    }

    console.log('✅ All tests passed! 🎉');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ All 11 Application Services exist');
    console.log('  ✅ All parent relationships are correct');
    console.log('  ✅ Services are properly distributed across offerings');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

testAltusApplicationServices()
  .catch(console.error)
  .finally(() => process.exit(0));
