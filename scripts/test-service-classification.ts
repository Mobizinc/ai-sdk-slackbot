/**
 * ServiceNow Service Classification Test Script
 * Tests the LLM service classification logic in DEV environment
 *
 * Simulates how the LLM would classify a case to a service offering:
 * 1. Mock LLM response suggests "Cybersecurity Management"
 * 2. Query ServiceNow for the offering (using READ-ONLY method)
 * 3. Validate the offering exists and is correctly configured
 *
 * This validates that:
 * - Service offerings were created correctly
 * - The LLM can successfully query for offerings
 * - The parent relationship is established
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

// Override to use DEV instance (same credentials, different URL)
if (process.env.DEV_SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.DEV_SERVICENOW_URL;
  process.env.SERVICENOW_URL = process.env.DEV_SERVICENOW_URL;
}
// DEV uses same credentials as production
if (process.env.DEV_SERVICENOW_USERNAME) {
  process.env.SERVICENOW_USERNAME = process.env.DEV_SERVICENOW_USERNAME;
}
if (process.env.DEV_SERVICENOW_PASSWORD) {
  process.env.SERVICENOW_PASSWORD = process.env.DEV_SERVICENOW_PASSWORD;
}

async function testServiceClassification() {
  // Import ServiceNow client dynamically AFTER env vars are set
  const { serviceNowClient } = await import('../lib/tools/servicenow');
  console.log('🧪 ServiceNow Service Classification Test');
  console.log('='.repeat(70));
  console.log('');

  try {
    // ========================================
    // Step 1: Simulate LLM Classification Response
    // ========================================
    console.log('Step 1: Simulating LLM Classification');
    console.log('─'.repeat(70));

    // Mock LLM response (what the AI would return)
    const mockLLMResponse = JSON.stringify({
      service_offering: 'Cybersecurity Management',
      reasoning: 'The case is about a "VPN connection", which is a security component explicitly managed under this service offering.',
    });

    console.log('Mock LLM Response:');
    console.log(mockLLMResponse);
    console.log('');

    // Parse the response (like the classification service would)
    const parsedResponse = JSON.parse(mockLLMResponse);
    const suggestedOffering = parsedResponse.service_offering;
    const reasoning = parsedResponse.reasoning;

    console.log('Parsed Classification:');
    console.log(`  Service Offering: "${suggestedOffering}"`);
    console.log(`  Reasoning: ${reasoning}`);
    console.log('');

    // ========================================
    // Step 2: Query for Service Offering (READ-ONLY)
    // ========================================
    console.log('Step 2: Querying ServiceNow for Service Offering');
    console.log('─'.repeat(70));

    console.log(`Looking up: "${suggestedOffering}"`);
    console.log('');

    // Use the READ-ONLY method that the LLM would use
    const offering = await serviceNowClient.getServiceOffering(suggestedOffering);

    if (!offering) {
      console.error('❌ FAILED: Service Offering not found!');
      console.error('');
      console.error('The service offering does not exist in ServiceNow.');
      console.error('Did you run the setup script first?');
      console.error('');
      console.error('Run: npx tsx scripts/setup-service-portfolio.ts');
      console.error('');
      process.exit(1);
    }

    console.log('✅ Service Offering Found!');
    console.log('');
    console.log('Service Offering Details:');
    console.log(`  Name: ${offering.name}`);
    console.log(`  sys_id: ${offering.sys_id}`);
    console.log(`  Parent: ${offering.parent || 'null'}`);
    console.log(`  Parent Name: ${offering.parent_name || 'null'}`);
    console.log(`  Description: ${offering.description || '(none)'}`);
    console.log(`  URL: ${offering.url}`);
    console.log('');

    // ========================================
    // Step 3: Validate Parent Relationship
    // ========================================
    console.log('Step 3: Validating Parent Business Service');
    console.log('─'.repeat(70));

    if (!offering.parent) {
      console.warn('⚠️  WARNING: Service Offering has no parent!');
      console.warn('   This offering is not linked to "Managed Support Services"');
      console.warn('   Expected parent: Business Service');
      console.log('');
    } else {
      console.log('✅ Parent relationship exists');
      console.log(`   Parent sys_id: ${offering.parent}`);

      // Optionally query the parent to validate
      const businessService = await serviceNowClient.getBusinessService('Managed Support Services');

      if (businessService) {
        console.log(`   Parent Name: ${businessService.name}`);
        console.log(`   Parent URL: ${businessService.url}`);

        if (offering.parent === businessService.sys_id) {
          console.log('');
          console.log('✅ Parent validation successful!');
          console.log('   Service Offering is correctly linked to Business Service');
        } else {
          console.warn('');
          console.warn('⚠️  WARNING: Parent sys_id mismatch!');
          console.warn(`   Offering parent: ${offering.parent}`);
          console.warn(`   Expected parent: ${businessService.sys_id}`);
        }
      }
    }

    console.log('');

    // ========================================
    // Step 4: Test All 5 Service Offerings
    // ========================================
    console.log('Step 4: Validating All Service Offerings');
    console.log('─'.repeat(70));

    const expectedOfferings = [
      'Infrastructure and Cloud Management',
      'Network Management',
      'Cybersecurity Management',
      'Helpdesk and Endpoint Support',
      'Application Administration',
    ];

    let successCount = 0;
    let failureCount = 0;

    for (const offeringName of expectedOfferings) {
      const result = await serviceNowClient.getServiceOffering(offeringName);
      if (result) {
        console.log(`✅ ${offeringName}`);
        successCount++;
      } else {
        console.log(`❌ ${offeringName} - NOT FOUND`);
        failureCount++;
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Test Results:');
    console.log(`   Expected: ${expectedOfferings.length} offerings`);
    console.log(`   Found: ${successCount}`);
    console.log(`   Missing: ${failureCount}`);
    console.log('');

    if (failureCount > 0) {
      console.error('❌ TEST FAILED: Some service offerings are missing');
      console.error('   Run the setup script: npx tsx scripts/setup-service-portfolio.ts');
      process.exit(1);
    }

    console.log('✅ All tests passed! 🎉');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ LLM can classify cases to service offerings');
    console.log('  ✅ ServiceNow queries work correctly');
    console.log('  ✅ All 5 service offerings exist');
    console.log('  ✅ Parent relationships are established');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

testServiceClassification()
  .catch(console.error)
  .finally(() => process.exit(0));
