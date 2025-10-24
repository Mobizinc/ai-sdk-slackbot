/**
 * UAT ServiceNow Service Offerings Verification Script
 *
 * Verifies that the 6 Service Portfolio offerings exist in UAT environment:
 * 1. Infrastructure and Cloud Management
 * 2. Network Management
 * 3. Cybersecurity Management
 * 4. Helpdesk and Endpoint Support - 24/7
 * 5. Helpdesk and Endpoint - Standard
 * 6. Application Administration
 *
 * This is a READ-ONLY test that queries UAT ServiceNow to validate
 * service offerings are properly configured before testing classification.
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

// Override to use UAT instance
if (process.env.UAT_SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.UAT_SERVICENOW_URL;
  process.env.SERVICENOW_URL = process.env.UAT_SERVICENOW_URL;
}
if (process.env.UAT_SERVICENOW_USERNAME) {
  process.env.SERVICENOW_USERNAME = process.env.UAT_SERVICENOW_USERNAME;
}
if (process.env.UAT_SERVICENOW_PASSWORD) {
  process.env.SERVICENOW_PASSWORD = process.env.UAT_SERVICENOW_PASSWORD;
}

async function testUATServiceOfferings() {
  // Import ServiceNow client dynamically AFTER env vars are set
  const { serviceNowClient } = await import('../lib/tools/servicenow');

  console.log('🧪 UAT Service Offerings Verification');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Environment: ${process.env.SERVICENOW_URL}`);
  console.log(`Username: ${process.env.SERVICENOW_USERNAME}`);
  console.log('');

  try {
    // ========================================
    // Step 1: Verify UAT Connection
    // ========================================
    console.log('Step 1: Verifying UAT ServiceNow Connection');
    console.log('─'.repeat(70));

    // Test connection by querying for the parent Business Service
    const businessService = await serviceNowClient.getBusinessService('Managed Support Services');

    if (!businessService) {
      console.error('❌ FAILED: Cannot connect to UAT or "Managed Support Services" not found');
      console.error('');
      console.error('Possible issues:');
      console.error('  1. UAT credentials are incorrect');
      console.error('  2. Parent Business Service not created in UAT');
      console.error('  3. Network/firewall blocking connection');
      console.error('');
      process.exit(1);
    }

    console.log('✅ Connected to UAT ServiceNow');
    console.log('');
    console.log('Parent Business Service:');
    console.log(`  Name: ${businessService.name}`);
    console.log(`  sys_id: ${businessService.sys_id}`);
    console.log(`  URL: ${businessService.url}`);
    console.log('');

    // ========================================
    // Step 2: Verify All 5 Service Offerings
    // ========================================
    console.log('Step 2: Verifying Service Offerings');
    console.log('─'.repeat(70));

    const expectedOfferings = [
      'Infrastructure and Cloud Management',
      'Network Management',
      'Cybersecurity Management',
      'Helpdesk and Endpoint Support - 24/7',
      'Helpdesk and Endpoint - Standard',
      'Application Administration',
    ];

    const results: Array<{
      name: string;
      found: boolean;
      sys_id?: string;
      parent?: string;
      parent_name?: string;
      url?: string;
    }> = [];

    for (const offeringName of expectedOfferings) {
      const result = await serviceNowClient.getServiceOffering(offeringName);

      if (result) {
        console.log(`✅ ${offeringName}`);
        console.log(`   sys_id: ${result.sys_id}`);
        console.log(`   Parent: ${result.parent_name || '(no parent)'}`);
        console.log('');

        results.push({
          name: offeringName,
          found: true,
          sys_id: result.sys_id,
          parent: result.parent,
          parent_name: result.parent_name,
          url: result.url,
        });
      } else {
        console.log(`❌ ${offeringName} - NOT FOUND`);
        console.log('');

        results.push({
          name: offeringName,
          found: false,
        });
      }
    }

    // ========================================
    // Step 3: Validate Parent Relationships
    // ========================================
    console.log('Step 3: Validating Parent Relationships');
    console.log('─'.repeat(70));

    let correctParentCount = 0;
    let missingParentCount = 0;
    let wrongParentCount = 0;

    for (const result of results) {
      if (!result.found) continue;

      if (!result.parent) {
        console.log(`⚠️  ${result.name}: No parent set`);
        missingParentCount++;
      } else if (result.parent === businessService.sys_id) {
        console.log(`✅ ${result.name}: Correctly linked to "${businessService.name}"`);
        correctParentCount++;
      } else {
        console.log(`❌ ${result.name}: Wrong parent (${result.parent_name})`);
        wrongParentCount++;
      }
    }

    console.log('');

    // ========================================
    // Step 4: Summary Report
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 Test Results Summary');
    console.log('─'.repeat(70));
    console.log('');

    const foundCount = results.filter(r => r.found).length;
    const missingCount = results.filter(r => !r.found).length;

    console.log('Service Offerings:');
    console.log(`  Expected: ${expectedOfferings.length}`);
    console.log(`  Found: ${foundCount}`);
    console.log(`  Missing: ${missingCount}`);
    console.log('');

    console.log('Parent Relationships:');
    console.log(`  Correct: ${correctParentCount}`);
    console.log(`  Missing: ${missingParentCount}`);
    console.log(`  Wrong: ${wrongParentCount}`);
    console.log('');

    // ========================================
    // Final Status
    // ========================================
    if (missingCount > 0) {
      console.error('❌ TEST FAILED: Some service offerings are missing from UAT');
      console.error('');
      console.error('Missing offerings:');
      results.filter(r => !r.found).forEach(r => {
        console.error(`  - ${r.name}`);
      });
      console.error('');
      console.error('Action required:');
      console.error('  Run setup script against UAT:');
      console.error('  UAT_SERVICENOW_URL=... npx tsx scripts/setup-service-portfolio.ts');
      console.error('');
      process.exit(1);
    }

    if (missingParentCount > 0 || wrongParentCount > 0) {
      console.warn('⚠️  WARNING: Some parent relationships need attention');
      console.warn('   Service offerings exist but may not be properly organized');
      console.warn('');
    }

    console.log('✅ All tests passed! 🎉');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ UAT ServiceNow is accessible');
    console.log('  ✅ All 5 service offerings exist');
    console.log('  ✅ Parent Business Service is configured');
    console.log('  ✅ Ready for Service Portfolio Classification testing');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

testUATServiceOfferings()
  .catch(console.error)
  .finally(() => process.exit(0));
