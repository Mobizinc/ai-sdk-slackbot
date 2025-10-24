/**
 * Test catalog redirect with real Altus cases
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts <case_number>
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';
import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';

// Import HR Request Detector
import { getHRRequestDetector } from '../lib/services/hr-request-detector';

async function testCatalogRedirect() {
  const caseNumber = process.argv[2];

  if (!caseNumber) {
    console.error('❌ Usage: npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts <case_number>');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts SCS0048754  # Termination');
    console.error('  npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts SCS0048833  # Onboarding');
    process.exit(1);
  }

  console.log('🧪 Testing Catalog Redirect System');
  console.log(`   Case: ${caseNumber}`);
  console.log('');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client not configured');
    process.exit(1);
  }

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 1: Fetch Case Details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const caseData = await serviceNowClient.getCase(caseNumber);

    if (!caseData) {
      console.error(`❌ Case ${caseNumber} not found`);
      process.exit(1);
    }

    console.log('Case Details:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Number:             ${caseData.number}`);
    console.log(`Short Description:  ${caseData.short_description}`);
    console.log(`Company:            ${caseData.company_name}`);
    console.log(`Company ID:         ${caseData.company}`);
    console.log(`Submitted By:       ${caseData.submitted_by}`);
    console.log(`Category:           ${caseData.category}`);
    console.log(`State:              ${caseData.state}`);
    console.log('');

    if (caseData.description) {
      console.log('Description (first 300 chars):');
      console.log('─────────────────────────────────────────────────────');
      console.log(caseData.description.substring(0, 300) + (caseData.description.length > 300 ? '...' : ''));
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STEP 2: Load Client Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const repo = getClientSettingsRepository();
    const clientId = caseData.company;

    if (!clientId) {
      console.error('❌ No company ID found in case');
      process.exit(1);
    }

    const clientSettings = await repo.getClientSettings(clientId);

    if (!clientSettings) {
      console.log('❌ No client settings found for this company');
      console.log('   Catalog redirect is not configured');
      process.exit(0);
    }

    console.log('Client Configuration:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Client Name:            ${clientSettings.clientName}`);
    console.log(`Redirect Enabled:       ${clientSettings.catalogRedirectEnabled ? '✅ Yes' : '❌ No'}`);
    console.log(`Confidence Threshold:   ${clientSettings.catalogRedirectConfidenceThreshold * 100}%`);
    console.log(`Auto-Close:             ${clientSettings.catalogRedirectAutoClose ? '✅ Yes' : '❌ No'}`);
    console.log(`Catalog Mappings:       ${clientSettings.customCatalogMappings?.length || 0}`);
    console.log('');

    if (!clientSettings.catalogRedirectEnabled) {
      console.log('⚠️  Catalog redirect is DISABLED for this client');
      process.exit(0);
    }

    if (clientSettings.customCatalogMappings && clientSettings.customCatalogMappings.length > 0) {
      console.log('Configured Mappings:');
      clientSettings.customCatalogMappings.forEach((mapping: any, i: number) => {
        console.log(`  ${i + 1}. ${mapping.requestType} → ${mapping.catalogItemNames.join(', ')}`);
        console.log(`     Keywords (${mapping.keywords.length}): ${mapping.keywords.slice(0, 5).join(', ')}...`);
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 STEP 3: Run HR Request Detection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const detector = getHRRequestDetector();
    const detectionResult = detector.detectHRRequest({
      shortDescription: caseData.short_description || '',
      description: caseData.description || '',
      category: caseData.category,
      subcategory: caseData.subcategory,
      customMappings: clientSettings.customCatalogMappings, // Use client-specific mappings
    });

    console.log('Detection Result:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Is HR Request:      ${detectionResult.isHRRequest ? '✅ Yes' : '❌ No'}`);
    console.log(`Request Type:       ${detectionResult.requestType || '(none)'}`);
    console.log(`Confidence:         ${(detectionResult.confidence * 100).toFixed(1)}%`);
    console.log(`Threshold:          ${clientSettings.catalogRedirectConfidenceThreshold * 100}%`);
    console.log(`Should Redirect:    ${detectionResult.confidence >= clientSettings.catalogRedirectConfidenceThreshold ? '✅ Yes' : '❌ No'}`);
    console.log('');

    if (detectionResult.matchedKeywords && detectionResult.matchedKeywords.length > 0) {
      console.log(`Matched Keywords (${detectionResult.matchedKeywords.length}):`);
      detectionResult.matchedKeywords.forEach((kw, i) => {
        console.log(`  ${i + 1}. "${kw}"`);
      });
      console.log('');
    }

    if (detectionResult.reasoning) {
      console.log('Detection Reasoning:');
      console.log('─────────────────────────────────────────────────────');
      console.log(detectionResult.reasoning);
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 STEP 4: Find Matching Catalog Items');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (!detectionResult.isHRRequest || detectionResult.confidence < clientSettings.catalogRedirectConfidenceThreshold) {
      console.log('⚠️  Confidence too low or not an HR request');
      console.log('   No catalog redirect will be performed');
      process.exit(0);
    }

    // Find matching catalog mapping
    const matchingMapping = clientSettings.customCatalogMappings?.find(
      (mapping: any) => mapping.requestType === detectionResult.requestType
    );

    if (!matchingMapping) {
      console.log('❌ No catalog mapping found for request type:', detectionResult.requestType);
      process.exit(0);
    }

    console.log('Matching Catalog Mapping:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Request Type:   ${matchingMapping.requestType}`);
    console.log(`Catalog Items:  ${matchingMapping.catalogItemNames.join(', ')}`);
    console.log(`Priority:       ${matchingMapping.priority}`);
    console.log('');

    // Fetch actual catalog items
    console.log('Fetching catalog item details...');
    console.log('');

    const catalogItems = [];
    for (const catalogName of matchingMapping.catalogItemNames) {
      const item = await serviceNowClient.getCatalogItemByName(catalogName);
      if (item) {
        catalogItems.push(item);
      }
    }

    if (catalogItems.length === 0) {
      console.log('❌ No catalog items found with specified names');
      process.exit(0);
    }

    console.log(`✅ Found ${catalogItems.length} catalog item(s):`);
    console.log('');
    catalogItems.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name}`);
      console.log(`   Sys ID:      ${item.sys_id}`);
      console.log(`   Description: ${item.short_description || '(none)'}`);
      console.log(`   Category:    ${item.category || '(none)'}`);
      console.log(`   Active:      ${item.active ? '✅ Yes' : '❌ No'}`);
      console.log(`   URL:         ${item.url}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 STEP 5: Generate Work Note');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const workNote = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 CATALOG ITEM REDIRECT RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi there,

Thank you for submitting this request. We noticed this appears to be a
${detectionResult.requestType.replace(/_/g, ' ')} request, and we have a dedicated catalog item designed specifically
for this type of request.

Using the proper catalog item ensures your request is:
  ✅ Routed to the correct team immediately
  ✅ Processed with the appropriate workflow
  ✅ Completed faster with fewer follow-up questions

📋 RECOMMENDED CATALOG ITEM${catalogItems.length > 1 ? 'S' : ''}:
${catalogItems.map(item => `  • ${item.name}\n    ${item.url}`).join('\n\n')}

Please resubmit your request using the catalog item${catalogItems.length > 1 ? 's' : ''} above.

If you have questions or need assistance, please contact ${clientSettings.supportContactInfo || 'IT Support'}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    console.log('Generated Work Note:');
    console.log('─────────────────────────────────────────────────────');
    console.log(workNote);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`Case Number:           ${caseData.number}`);
    console.log(`Company:               ${clientSettings.clientName}`);
    console.log(`Detected Type:         ${detectionResult.requestType}`);
    console.log(`Confidence:            ${(detectionResult.confidence * 100).toFixed(1)}%`);
    console.log(`Threshold Met:         ${detectionResult.confidence >= clientSettings.catalogRedirectConfidenceThreshold ? '✅ Yes' : '❌ No'}`);
    console.log(`Catalog Items Found:   ${catalogItems.length}`);
    console.log(`Would Add Work Note:   ✅ Yes`);
    console.log(`Would Auto-Close:      ${clientSettings.catalogRedirectAutoClose ? '✅ Yes' : '❌ No (work notes only)'}`);
    console.log('');
    console.log('This is a DRY RUN - no changes have been made to ServiceNow');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing catalog redirect:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

testCatalogRedirect();
